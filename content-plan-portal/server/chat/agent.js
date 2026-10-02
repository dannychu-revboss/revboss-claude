// Chat over a live plan, powered by Claude with tool use. Streams text to the
// browser as it is generated; tools read the same synced plan the page shows.
import Anthropic from "@anthropic-ai/sdk";
import { buildTools, fns } from "./tools.js";
import { getPlan } from "../store.js";
import { todayISO } from "../plans.js";

const MODEL = process.env.CHAT_MODEL || "claude-opus-5-5";
const EFFORT = process.env.CHAT_EFFORT || "low";

export const chatEnabled = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const client = chatEnabled ? new Anthropic() : null;

// Kept byte-stable per plan so the prompt cache hits across turns.
function systemPrompt(plan, viewer) {
  const audience =
    viewer === "team"
      ? "You are talking with a RevBoss team member preparing for or running a client call. Be direct and operational."
      : `You are talking with ${plan.person} at ${plan.client}, the client this plan was written for. Speak to them as "you". They are busy; lead with the answer.`;
  return [
    `You are the assistant inside RevBoss's interactive content plan for ${plan.person} (${plan.client}), month ${plan.month}.`,
    `RevBoss writes and schedules LinkedIn posts for clients in Ordinal. This plan organizes the month's posts by ${plan.framework} (${plan.angleWord.toLowerCase()}s), with a short topic tag per post and a status that comes from Ordinal.`,
    audience,
    "Use the tools for every fact about posts, statuses, asks and numbers; never guess a figure, date or title. If a number is labelled demo data, say it is sample data.",
    "Answer in plain sentences, short. Use a compact list only for several posts. Give dates as weekday + month + day (Tue Oct 13). No emoji.",
    "To approve a post, the client approves it in Ordinal: give them the post's Ordinal link. You cannot approve, schedule, publish or edit posts yourself.",
    "When they want a change, or want to tell the team something, use leave_feedback and confirm what you passed on. The RevBoss team picks it up from the Ordinal comment.",
    `To move a post to a different ${plan.angleWord.toLowerCase()}, use request_angle_change: it goes to the team for approval and the post stays put until then. They can also drag the card on the Board view (grouped by ${plan.angleWord.toLowerCase()}).`,
    "If something is outside what the plan and its data can answer, say so and suggest booking time with Danny" + (plan.bookingUrl ? ` (${plan.bookingUrl})` : "") + ".",
  ].join("\n\n");
}

/**
 * @param {object} o
 * @param {string} o.planId
 * @param {{role:"user"|"assistant", content:string}[]} o.history prior text turns
 * @param {string} o.message the new user message
 * @param {"client"|"team"} o.viewer
 * @param {(e:object)=>void} o.emit  stream events to the caller
 */
export async function runChat({ planId, history, message, viewer, emit }) {
  const plan = getPlan(planId);
  if (!chatEnabled) return offlineAnswer(planId, message, emit);

  const messages = [
    ...history.slice(-20).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: `${message}\n\n(Today is ${todayISO()}.)` },
  ];

  const runner = client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 8000,
    system: [{ type: "text", text: systemPrompt(plan, viewer), cache_control: { type: "ephemeral" } }],
    output_config: { effort: EFFORT },
    // On a safety decline, re-run on Anthropic's recommended fallback model instead of failing.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    tools: buildTools(planId, { author: viewer === "team" ? "RevBoss team" : plan.person }),
    messages,
    stream: true,
    max_iterations: 8,
  });

  let answered = false;
  for await (const messageStream of runner) {
    for await (const event of messageStream) {
      if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
        emit({ type: "tool", name: event.content_block.name });
      } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        answered = true;
        emit({ type: "text", text: event.delta.text });
      }
    }
    const msg = await messageStream.finalMessage();
    if (msg.stop_reason === "refusal") {
      emit({ type: "text", text: "\n\nI can't help with that one here. Danny can pick it up with you directly." });
      answered = true;
      break;
    }
    if (msg.stop_reason === "max_tokens" && msg.content.some((b) => b.type === "tool_use")) {
      throw new Error("tool input truncated");
    }
  }
  if (!answered) emit({ type: "text", text: "Done." });
}

// Without an API key the chat still answers the most common questions straight
// from the plan data, so the demo works end to end.
function offlineAnswer(planId, message, emit) {
  const q = message.toLowerCase();
  const o = fns.overview(planId);
  let text;
  if (/(wait|need|approv|todo|to do|ask|me to)/.test(q)) {
    const asks = o.waitingOnYou.filter((a) => !a.done);
    const pending = fns.listPosts(planId).filter((p) => /approval (waiting|overdue)/i.test(p.status));
    text =
      (asks.length ? `Open asks:\n${asks.map((a) => `- ${a.when ? `${a.when}: ` : ""}${a.ask}`).join("\n")}\n\n` : "No open asks right now.\n\n") +
      (pending.length ? `${pending.length} post${pending.length > 1 ? "s" : ""} waiting on approval in Ordinal, starting with ${pending[0].day} "${pending[0].title}".` : "Nothing is waiting on approval.");
  } else if (/(perform|doing|impression|engag|metric|number|best|top|work)/.test(q)) {
    const p = fns.performance(planId);
    text = p.measuredPosts
      ? `${p.measuredPosts} published post${p.measuredPosts > 1 ? "s" : ""} so far: ${p.impressions.toLocaleString()} impressions and ${p.engagements} engagements` +
        (p.engagementRate != null ? ` (${(p.engagementRate * 100).toFixed(1)}%)` : "") +
        `. Top so far: "${p.topPosts[0].title}" with ${p.topPosts[0].impressions} impressions. (${p.dataSource})`
      : "Nothing has published yet this month, so there are no numbers yet.";
  } else if (/(next|upcoming|coming)/.test(q)) {
    text = o.nextPost ? `Next up: "${o.nextPost.title}" on ${o.nextPost.date}.` : "Everything this month has gone out.";
  } else {
    const t = o.totals;
    text = `${o.person}'s ${o.month} plan has ${t.posts} posts: ${t.Posted} posted, ${t.Scheduled} scheduled, ${t["Approval waiting"] + t["Approval overdue"]} waiting on approval.`;
  }
  emit({ type: "text", text: `${text}\n\n_Offline mode: set ANTHROPIC_API_KEY to turn on the full Claude chat._` });
}
