// The chat's tools. Each reads the live plan (already synced with Ordinal) so the
// answers match what the page shows. Plain functions first, so the offline
// responder and tests can use them without the model.
import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { getPlan, updatePlan } from "../store.js";
import { ordinal } from "../ordinal/index.js";
import { summarize, effectiveStatus, statusLabel, findPost, fmtDate, STATUS_HELP, STATUSES } from "../plans.js";

function postLine(p) {
  const m = p.metrics;
  return {
    id: p.id,
    date: p.date,
    day: fmtDate(p.date),
    angle: p.angle,
    topicTag: p.topicTag,
    title: p.title,
    type: p.type,
    ...(p.account ? { account: p.account } : {}),
    status: statusLabel(effectiveStatus(p)),
    ...(m ? { impressions: m.impressions, reactions: m.reactions, comments: m.comments, reposts: m.reposts } : {}),
  };
}

export const fns = {
  overview(planId) {
    const plan = getPlan(planId);
    const s = summarize(plan);
    return {
      client: plan.client,
      person: plan.person,
      month: plan.month,
      period: plan.periodLabel,
      framework: plan.framework,
      intro: plan.intro,
      totals: { posts: s.total, ...Object.fromEntries(Object.entries(s.counts).map(([k, v]) => [statusLabel(k), v])) },
      angles: s.angles.map((a) => ({ name: a.name, target: a.target, planned: a.planned, published: a.published, why: a.why })),
      waitingOnYou: plan.waitingOn.map((w, i) => ({ index: i, when: w.when, ask: w.ask, done: !!w.done })),
      nextPost: s.nextPost,
      campaignsAndNotes: plan.sections,
      pendingAngleRequests: plan.angleRequests.filter((r) => r.status === "pending").map((r) => ({ post: r.postTitle, from: r.fromAngle, to: r.toAngle, by: r.author })),
      statusKey: STATUS_HELP,
      lastSyncedWithOrdinal: plan.lastSyncedAt || null,
      dataSource: plan.lastSyncAdapter === "live" ? "Ordinal (live)" : "demo data",
    };
  },

  listPosts(planId, { status, angle, from, to, account } = {}) {
    const plan = getPlan(planId);
    return plan.posts
      .filter((p) => !status || effectiveStatus(p) === status)
      .filter((p) => !angle || p.angle.toLowerCase() === angle.toLowerCase())
      .filter((p) => !account || (p.account || plan.person).toLowerCase().includes(account.toLowerCase()))
      .filter((p) => !from || p.date >= from)
      .filter((p) => !to || p.date <= to)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(postLine);
  },

  async getPost(planId, { post }) {
    const plan = getPlan(planId);
    const p = findPost(plan, post);
    if (!p) return { error: `No post matching "${post}". Use list_posts to see titles.` };
    let approvals = [];
    if (p.ordinalPostId && plan.ordinalWorkspace) {
      try {
        approvals = await ordinal.listApprovals(plan.ordinalWorkspace, p.ordinalPostId);
      } catch {
        approvals = [];
      }
    }
    return {
      ...postLine(p),
      metrics: p.metrics,
      approvals,
      ordinalUrl: p.ordinalUrl,
      copyPreview: p.copy ? p.copy.slice(0, 1200) : null,
      feedback: plan.feedback.filter((f) => f.postId === p.id),
    };
  },

  performance(planId) {
    const plan = getPlan(planId);
    const s = summarize(plan);
    const measured = plan.posts.filter((p) => p.metrics);
    const byAngle = {};
    for (const p of measured) {
      const a = (byAngle[p.angle] ||= { posts: 0, impressions: 0, engagements: 0 });
      a.posts++;
      a.impressions += p.metrics.impressions || 0;
      a.engagements += (p.metrics.reactions || 0) + (p.metrics.comments || 0) + (p.metrics.reposts || 0);
    }
    return {
      dataSource: measured.some((p) => p.metrics.demo) ? "demo sample numbers (Ordinal not connected)" : "Ordinal LinkedIn analytics",
      publishedPosts: s.counts.posted,
      measuredPosts: measured.length,
      impressions: s.impressions,
      engagements: s.engagements,
      engagementRate: s.engagementRate,
      byAngle,
      topPosts: measured
        .sort((a, b) => (b.metrics.impressions || 0) - (a.metrics.impressions || 0))
        .slice(0, 5)
        .map(postLine),
      note: measured.length ? null : "Nothing has published yet this month, so there are no numbers yet.",
    };
  },

  async leaveFeedback(planId, { post, message, author, silent = false }) {
    const plan = getPlan(planId);
    const p = post ? findPost(plan, post) : null;
    if (post && !p) return { error: `No post matching "${post}".` };
    let sentToOrdinal = false;
    if (p?.ordinalPostId && plan.ordinalWorkspace) {
      try {
        await ordinal.addComment(plan.ordinalWorkspace, p.ordinalPostId, `[via content plan] ${message}`);
        sentToOrdinal = ordinal.live;
      } catch (err) {
        console.error("[feedback] Ordinal comment failed:", err.message);
      }
    }
    const item = { id: `f${Date.now().toString(36)}`, at: new Date().toISOString(), postId: p?.id || null, postTitle: p?.title || null, message, author: author || plan.person, sentToOrdinal, resolved: false };
    updatePlan(planId, (pl) => {
      pl.feedback.unshift(item);
      return { kind: "feedback", text: `${item.author} left feedback${p ? ` on "${p.title}"` : ""}`, silent };
    });
    return { saved: true, sentToOrdinal, item };
  },

  // A client asks to re-file a post under another angle. Nothing moves until
  // the team approves; the request is logged as feedback and, when Ordinal is
  // connected, added as a comment on the post.
  async requestAngleChange(planId, { post, toAngle, note, author }) {
    const plan = getPlan(planId);
    const p = findPost(plan, post);
    if (!p) return { error: `No post matching "${post}".` };
    const target = plan.angles.find((a) => a.name.toLowerCase() === String(toAngle || "").toLowerCase());
    if (!target) return { error: `"${toAngle}" isn't one of this plan's ${plan.angleWord.toLowerCase()}s: ${plan.angles.map((a) => a.name).join(", ")}.` };
    if (target.name === p.angle) return { error: `"${p.title}" is already ${target.name}.` };
    const message = `Please move "${p.title}" from ${p.angle} to ${target.name}.${note ? ` ${note}` : ""}`;
    const fb = await fns.leaveFeedback(planId, { post: p.id, message, author, silent: true });
    const req = {
      id: `r${Date.now().toString(36)}`, at: new Date().toISOString(), postId: p.id, postTitle: p.title,
      fromAngle: p.angle, toAngle: target.name, note: note || "", author: author || plan.person,
      status: "pending", feedbackId: fb.item?.id || null,
    };
    updatePlan(planId, (pl) => {
      // One open request per post: a new drag replaces the previous ask.
      for (const r of pl.angleRequests) if (r.postId === p.id && r.status === "pending") r.status = "replaced";
      pl.angleRequests.unshift(req);
      return { kind: "angle_request", text: `${req.author} asked to move "${p.title}" to ${target.name}`, postId: p.id };
    });
    return { saved: true, request: req, sentToOrdinal: fb.sentToOrdinal };
  },

  decideAngleRequest(planId, { id, decision, by = "RevBoss team" }) {
    let out;
    updatePlan(planId, (pl) => {
      const r = pl.angleRequests.find((x) => x.id === id);
      if (!r || r.status !== "pending") {
        out = { error: "That request is no longer open." };
        return null;
      }
      const post = pl.posts.find((x) => x.id === r.postId);
      r.status = decision === "approve" ? "approved" : "declined";
      r.decidedAt = new Date().toISOString();
      r.decidedBy = by;
      if (r.status === "approved" && post) post.angle = r.toAngle;
      const fb = pl.feedback.find((f) => f.id === r.feedbackId);
      if (fb) fb.resolved = true;
      out = { ok: true, request: r };
      return {
        kind: "angle_request",
        text: r.status === "approved" ? `Moved "${r.postTitle}" to ${r.toAngle}, as requested` : `Kept "${r.postTitle}" in ${r.fromAngle} for now`,
        postId: r.postId,
      };
    });
    return out;
  },

  completeAsk(planId, { index, done = true }) {
    let ask;
    updatePlan(planId, (pl) => {
      ask = pl.waitingOn[index];
      if (!ask) return null;
      ask.done = done;
      return { kind: "ask", text: `${done ? "Done" : "Reopened"}: ${ask.ask}` };
    });
    return ask ? { ok: true, ask } : { error: `No ask at index ${index}` };
  },
};

const STATUS_KEYS = Object.keys(STATUSES);

export function buildTools(planId, { author } = {}) {
  const json = (v) => JSON.stringify(v);
  const tools = [
    betaZodTool({
      name: "get_plan_overview",
      description: "The plan at a glance: totals by status, the angle/pillar budget vs what's planned and published, the open 'waiting on you' asks, the next post, campaigns, and when it last synced with Ordinal. Call this first for most questions.",
      inputSchema: z.object({}),
      run: async () => json(fns.overview(planId)),
    }),
    betaZodTool({
      name: "list_posts",
      description: "List this month's posts, optionally filtered. Dates are YYYY-MM-DD. Status values: " + STATUS_KEYS.join(", ") + ".",
      inputSchema: z.object({
        status: z.enum(STATUS_KEYS).optional(),
        angle: z.string().optional().describe("Angle or pillar name, e.g. Stance"),
        account: z.string().optional().describe("For multi-account plans: person or company page name"),
        from: z.string().optional(),
        to: z.string().optional(),
      }),
      run: async (input) => json(fns.listPosts(planId, input)),
    }),
    betaZodTool({
      name: "get_post",
      description: "Full detail for one post: status, approvals from Ordinal, LinkedIn metrics if published, copy preview, link to Ordinal, and any feedback already left on it.",
      inputSchema: z.object({ post: z.string().describe("Post id (e.g. p03), Ordinal id, or (part of) its title") }),
      run: async (input) => json(await fns.getPost(planId, input)),
    }),
    betaZodTool({
      name: "get_performance",
      description: "How published posts are doing on LinkedIn: impressions, engagements, engagement rate, totals by angle, and the top posts.",
      inputSchema: z.object({}),
      run: async () => json(fns.performance(planId)),
    }),
    betaZodTool({
      name: "leave_feedback",
      description: "Record the viewer's feedback or a change request, on one post or on the plan as a whole. It is saved to the plan and, for a post, added as a comment on the Ordinal post for the RevBoss team. Only call this when the viewer clearly asks to pass something on; confirm the wording back to them.",
      inputSchema: z.object({
        post: z.string().optional().describe("Post id or title; omit for plan-level feedback"),
        message: z.string().min(1).max(2000),
      }),
      run: async (input) => json(await fns.leaveFeedback(planId, { ...input, author })),
    }),
    betaZodTool({
      name: "request_angle_change",
      description: "Ask the RevBoss team to move a post to a different angle/pillar. The post doesn't move until the team approves; tell the viewer that. Only call this when the viewer asks for it.",
      inputSchema: z.object({
        post: z.string().describe("Post id or title"),
        toAngle: z.string().describe("Target angle or pillar name, exactly as the plan names it"),
        note: z.string().max(1000).optional().describe("The viewer's reason, if they gave one"),
      }),
      run: async (input) => json(await fns.requestAngleChange(planId, { ...input, author })),
    }),
    betaZodTool({
      name: "complete_ask",
      description: "Mark one of the 'waiting on you' asks as done (or reopen it) when the viewer says they've handled it.",
      inputSchema: z.object({ index: z.number().int().min(0), done: z.boolean().default(true) }),
      run: async (input) => json(fns.completeAsk(planId, input)),
    }),
  ];
  // Stream tool inputs as they're generated; betaZodTool still validates before run().
  return tools.map((t) => ({ ...t, eager_input_streaming: true }));
}
