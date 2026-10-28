import type { ClientConfig, MatrixRule } from "./types.ts";

const INSTRUCTIONS = `You are the RevBoss Reply Assistant. RevBoss runs LinkedIn and email outreach on behalf of the client described below. Prospects reply to that outreach, and the client's team uses you to decide how to answer each reply and to draft the answer.

How to work:
- Figure out which reply you are answering. The user may paste it, describe it, dictate it, or point you at a LinkedIn conversation. When HeyReach tools are available and the user refers to a lead or "my inbox", look the conversation up rather than asking them to paste it. Read the full thread before drafting; earlier messages matter.
- Classify the reply against the follow-up matrix. Pick the single best-matching scenario by its id. If nothing fits, use "none" and say so; do not force a match.
- Then call present_reply_options with 2-3 ready-to-send options drawn from that scenario's options. Base each draft on the linked template when there is one, adapted to this lead and thread: fill placeholders with real details, never leave {{...}} in a draft, and never invent facts about the lead.
- Only recommend assets by the ids listed in the asset library. When a Drive file is relevant but not in the library, give its link in your text instead. If the scenario calls for an asset that does not exist, say that the client should create one.
- Write in the client's voice. LinkedIn messages are short (usually under 80 words), conversational, with no subject line, no bullet points and no sign-off block. Emails get a subject and the client's signature.
- After presenting options, add at most two sentences of reasoning or a question, not a recap of the drafts.
- If the user just asks a question (about the matrix, an asset, strategy), answer it directly without calling present_reply_options.
- You draft; humans send. Never claim that a message was sent.`;

function renderRule(rule: MatrixRule, client: ClientConfig): string {
  const templates = new Map(client.templates.map((t) => [t.id, t]));
  const assets = new Map(client.assets.map((a) => [a.id, a]));
  const options = rule.options
    .map((o, i) => {
      const parts = [`  ${i + 1}. ${o.label}`];
      if (o.templateId) {
        const t = templates.get(o.templateId);
        parts.push(t ? `     template: ${t.id} ("${t.name}")` : `     template: ${o.templateId} (missing from template library)`);
      }
      if (o.assetIds.length) {
        const names = o.assetIds.map((id) => (assets.get(id) ? `${id} ("${assets.get(id)!.title}")` : `${id} (missing)`));
        parts.push(`     assets: ${names.join(", ")}`);
      }
      if (o.guidance) parts.push(`     guidance: ${o.guidance}`);
      return parts.join("\n");
    })
    .join("\n");
  return [
    `### ${rule.id}: ${rule.scenario}`,
    `intent: ${rule.intent}`,
    `signals: ${rule.signals.map((s) => `"${s}"`).join("; ")}`,
    `goal: ${rule.goal}`,
    `options:\n${options}`,
    rule.avoid ? `avoid: ${rule.avoid}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Builds the system prompt for one client. Deterministic, so identical configs produce identical (cacheable) prompts. */
export function buildSystemPrompt(client: ClientConfig): string {
  const p = client.profile;
  const sections = [
    INSTRUCTIONS,
    `## Client\nname: ${client.name}\ncompany: ${p.company}\noffer: ${p.offer}\naudience: ${p.audience}\nvoice: ${p.voice}` +
      (p.calendarLink ? `\ncalendar link: ${p.calendarLink}` : "") +
      (p.signature ? `\nemail signature:\n${p.signature}` : ""),
    `## Follow-up matrix\n${client.matrix.length ? client.matrix.map((r) => renderRule(r, client)).join("\n\n") : "(no scenarios configured yet)"}`,
    `## Template library\n${
      client.templates.length
        ? client.templates
            .map((t) => `### ${t.id}: ${t.name} [${t.channel}]\n${t.body}${t.notes ? `\nnotes: ${t.notes}` : ""}`)
            .join("\n\n")
        : "(no templates yet)"
    }`,
    `## Asset library\n${
      client.assets.length
        ? client.assets
            .map(
              (a) =>
                `- ${a.id} [${a.type}] "${a.title}": ${a.description}${a.whenToUse ? ` | use when: ${a.whenToUse}` : ""} | link: ${a.url}${a.driveFileId ? ` | drive_file_id: ${a.driveFileId}` : ""}`,
            )
            .join("\n")
        : "(no assets yet)"
    }`,
  ];
  if (client.knowledge.length) {
    sections.push(
      `## Background knowledge (call transcripts, notes, FAQs)\n${client.knowledge
        .map((k) => `<document title="${k.title.replace(/"/g, "'")}" kind="${k.kind}">\n${k.text}\n</document>`)
        .join("\n\n")}`,
    );
  }
  return sections.join("\n\n");
}
