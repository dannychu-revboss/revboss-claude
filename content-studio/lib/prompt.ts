import { prisma } from "@/lib/db";
import { parseOffers, parseTags } from "@/lib/utils";

const MAX_KNOWLEDGE_ITEMS = 6;
const MAX_KNOWLEDGE_CHARS = 2500;
const MAX_STYLE_EXAMPLES = 5;
const MAX_EXAMPLE_CHARS = 2000;

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max) + "\n[...truncated]";
}

/**
 * Score knowledge items by keyword overlap with the query so the most
 * relevant client context rides along with every generation. Falls back
 * to most-recent items when nothing matches.
 */
function rankKnowledge<T extends { title: string; content: string; tags: string }>(
  items: T[],
  query: string
): T[] {
  const words = Array.from(
    new Set(
      query
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3)
    )
  );
  const scored = items.map((item) => {
    const haystack = `${item.title} ${parseTags(item.tags).join(" ")} ${item.content}`.toLowerCase();
    let score = 0;
    for (const w of words) {
      if (item.title.toLowerCase().includes(w)) score += 3;
      else if (haystack.includes(w)) score += 1;
    }
    return { item, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const matched = scored.filter((s) => s.score > 0).map((s) => s.item);
  if (matched.length >= MAX_KNOWLEDGE_ITEMS) return matched.slice(0, MAX_KNOWLEDGE_ITEMS);
  // pad with most recent unmatched items
  const rest = items.filter((i) => !matched.includes(i));
  return [...matched, ...rest].slice(0, MAX_KNOWLEDGE_ITEMS);
}

export async function buildSystemPrompt(clientId: string, latestUserMessage: string): Promise<string> {
  const client = await prisma.client.findUniqueOrThrow({
    where: { id: clientId },
    include: {
      knowledge: { orderBy: { updatedAt: "desc" } },
      examples: { orderBy: { createdAt: "desc" }, take: MAX_STYLE_EXAMPLES },
      preferences: { orderBy: { createdAt: "asc" } },
    },
  });

  const offers = parseOffers(client.offers);
  const knowledge = rankKnowledge(client.knowledge, latestUserMessage);

  const sections: string[] = [];

  sections.push(
    `You are Kleo-style content copilot for RevBoss, a B2B agency that ghostwrites LinkedIn content for its clients. You are currently writing as/for the client "${client.name}". Everything you produce must sound like ${client.name} wrote it themselves — never like an agency or an AI.`
  );

  if (client.about.trim()) {
    sections.push(`## About ${client.name}\n${client.about.trim()}`);
  }
  if (client.story.trim()) {
    sections.push(`## Their story\n${client.story.trim()}`);
  }
  if (offers.length) {
    sections.push(
      `## Offers (what they sell)\n` +
        offers.map((o) => `- **${o.title}**: ${o.description}`).join("\n")
    );
  }
  if (client.archetype.trim()) {
    sections.push(`## Founder archetype\n${client.archetype.trim()}`);
  }
  if (client.voiceGuide.trim()) {
    sections.push(`## Voice & styling guide\n${client.voiceGuide.trim()}`);
  }
  if (client.preferences.length) {
    sections.push(
      `## Content preferences (hard rules — always follow)\n` +
        client.preferences.map((p) => `- ${p.rule}`).join("\n")
    );
  }
  if (client.examples.length) {
    sections.push(
      `## Writing examples (match this voice, rhythm, and formatting)\n` +
        client.examples
          .map((e, i) => `### Example ${i + 1}${e.title ? `: ${e.title}` : ""}\n${truncate(e.content, MAX_EXAMPLE_CHARS)}`)
          .join("\n\n")
    );
  }
  if (knowledge.length) {
    sections.push(
      `## Knowledge base (client facts, interviews, and source material — ground your content in this; never invent facts about the client)\n` +
        knowledge
          .map(
            (k) =>
              `### ${k.title}${parseTags(k.tags).length ? ` [tags: ${parseTags(k.tags).join(", ")}]` : ""}\n${truncate(k.content, MAX_KNOWLEDGE_CHARS)}`
          )
          .join("\n\n")
    );
  }

  sections.push(
    `## How to respond
- You help RevBoss content writers ideate, draft, edit, and repurpose LinkedIn content for this client.
- When you produce ready-to-publish post copy, wrap EACH complete post in tags exactly like this: <post title="Short descriptive title">post copy here</post>. The writer's editor picks these up, so include the full post inside the tags with real line breaks.
- LinkedIn formatting: short lines, generous white space, a scroll-stopping first line (the hook shows before "see more"), no markdown syntax inside posts (plain text only — LinkedIn doesn't render markdown), and at most 2-3 hashtags only when they genuinely help.
- Keep posts under 3,000 characters. Ideal length is usually 800-1,600.
- Outside of <post> tags, talk to the writer normally (analysis, options, feedback, ideas) using markdown.
- Ground every factual claim about the client in the knowledge base above. If you need facts you don't have, ask the writer instead of inventing them.`
  );

  return sections.join("\n\n");
}
