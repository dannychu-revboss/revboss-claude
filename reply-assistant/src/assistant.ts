import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { MODEL, EFFORT } from "./config.ts";
import type { ClientConfig, ReplyOptions } from "./types.ts";
import * as heyreach from "./integrations/heyreach.ts";
import * as drive from "./integrations/drive.ts";

const client = new Anthropic();

export type AssistantEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; label: string }
  | { type: "options"; data: ReplyOptions }
  | { type: "notice"; text: string };

// ---- Tool schemas -------------------------------------------------------------------------
// The tool list is the same for every client and every turn so the request prefix stays stable;
// tools for integrations a client hasn't configured return an error result instead of disappearing.

const ListConversationsInput = z.object({
  search: z.string().optional(),
  unread_only: z.boolean().optional(),
  replies_only: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});
const GetConversationInput = z.object({ account_id: z.number().int(), conversation_id: z.string().min(1) });
const DriveSearchInput = z.object({ query: z.string(), limit: z.number().int().min(1).max(50).optional() });
const DriveReadInput = z.object({ file_id: z.string().min(1) });
const ReplyOptionsInput = z.object({
  matched_rule_id: z.string(),
  scenario: z.string(),
  reply_summary: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  conversation: z
    .object({ account_id: z.number().int(), conversation_id: z.string(), lead_name: z.string() })
    .nullable(),
  options: z
    .array(
      z.object({
        label: z.string(),
        channel: z.enum(["linkedin", "email"]),
        subject: z.string(),
        message: z.string().min(1),
        asset_ids: z.array(z.string()),
        why: z.string(),
      }),
    )
    .min(1)
    .max(4),
});

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "heyreach_list_conversations",
    description:
      "List recent LinkedIn conversations from the client's HeyReach inbox, newest first. Use replies_only to find threads where the prospect replied last (the ones that need an answer). search matches lead names and message text.",
    input_schema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Lead name, company or text to search for" },
        unread_only: { type: "boolean" },
        replies_only: { type: "boolean", description: "Only threads whose last message is from the prospect" },
        limit: { type: "integer", minimum: 1, maximum: 100 },
      },
    },
  },
  {
    name: "heyreach_get_conversation",
    description: "Read the full message thread and lead profile for one LinkedIn conversation. Voice notes include their transcripts.",
    input_schema: {
      type: "object",
      properties: { account_id: { type: "integer" }, conversation_id: { type: "string" } },
      required: ["account_id", "conversation_id"],
    },
  },
  {
    name: "drive_search",
    description:
      "Search the client's Google Drive collateral folders (one sheets, lead magnets, tear sheets, case studies, decks) by name or content. Empty query lists the most recently modified files.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 50 } },
      required: ["query"],
    },
  },
  {
    name: "drive_read_file",
    description: "Read the contents of a file in the client's Drive folders (Docs, Slides, Sheets, PDFs, text).",
    input_schema: { type: "object", properties: { file_id: { type: "string" } }, required: ["file_id"] },
  },
  {
    name: "present_reply_options",
    description:
      "Show the user ready-to-send reply options as cards they can copy, edit or send. Call this whenever you have drafted replies to a prospect. conversation must be set when the reply came from HeyReach (so the user can send it from the card), otherwise null. For LinkedIn, subject is an empty string.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        matched_rule_id: { type: "string", description: 'Matrix scenario id, or "none"' },
        scenario: { type: "string", description: "Scenario name as shown to the user" },
        reply_summary: { type: "string", description: "One sentence: what the prospect said" },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
        conversation: {
          anyOf: [
            {
              type: "object",
              properties: {
                account_id: { type: "integer" },
                conversation_id: { type: "string" },
                lead_name: { type: "string" },
              },
              required: ["account_id", "conversation_id", "lead_name"],
            },
            { type: "null" },
          ],
        },
        options: {
          type: "array",
          minItems: 1,
          maxItems: 4,
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "Short name, e.g. 'Send the one sheet + ask for a call'" },
              channel: { type: "string", enum: ["linkedin", "email"] },
              subject: { type: "string" },
              message: { type: "string", description: "The full ready-to-send message" },
              asset_ids: { type: "array", items: { type: "string" }, description: "Asset library ids to attach/link" },
              why: { type: "string", description: "One sentence on when to pick this option" },
            },
            required: ["label", "channel", "subject", "message", "asset_ids", "why"],
          },
        },
      },
      required: ["matched_rule_id", "scenario", "reply_summary", "confidence", "conversation", "options"],
    },
  },
];

// ---- Tool execution -----------------------------------------------------------------------

type ToolResultContent = Anthropic.Beta.BetaToolResultBlockParam["content"];

interface ToolOutcome {
  content: ToolResultContent;
  isError?: boolean;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function runTool(
  cfg: ClientConfig,
  name: string,
  input: unknown,
  emit: (e: AssistantEvent) => void,
): Promise<ToolOutcome> {
  try {
    switch (name) {
      case "heyreach_list_conversations": {
        const args = ListConversationsInput.parse(input);
        if (!heyreach.heyReachConfigured(cfg)) return { content: "HeyReach is not connected for this client. Ask the user to paste the reply instead.", isError: true };
        emit({ type: "tool", label: args.search ? `Searching LinkedIn inbox for "${args.search}"` : "Checking LinkedIn inbox" });
        const res = await heyreach.listConversations(cfg, {
          search: args.search,
          unreadOnly: args.unread_only,
          repliesOnly: args.replies_only,
          limit: args.limit,
        });
        return { content: JSON.stringify(res) };
      }
      case "heyreach_get_conversation": {
        const args = GetConversationInput.parse(input);
        if (!heyreach.heyReachConfigured(cfg)) return { content: "HeyReach is not connected for this client.", isError: true };
        emit({ type: "tool", label: "Reading LinkedIn thread" });
        return { content: JSON.stringify(await heyreach.getConversation(cfg, args.account_id, args.conversation_id)) };
      }
      case "drive_search": {
        const args = DriveSearchInput.parse(input);
        if (!drive.driveConfigured(cfg)) return { content: "Google Drive is not connected for this client. Use the asset library only.", isError: true };
        emit({ type: "tool", label: `Searching Drive for "${args.query}"` });
        return { content: JSON.stringify(await drive.searchFiles(cfg, args.query, args.limit)) };
      }
      case "drive_read_file": {
        const args = DriveReadInput.parse(input);
        if (!drive.driveConfigured(cfg)) return { content: "Google Drive is not connected for this client.", isError: true };
        emit({ type: "tool", label: "Reading Drive file" });
        const file = await drive.readFile(cfg, args.file_id);
        if (file.kind === "pdf") {
          return {
            content: [
              { type: "text", text: `PDF "${file.name}" (${file.url})` },
              { type: "document", source: { type: "base64", media_type: "application/pdf", data: file.base64 } },
            ],
          };
        }
        if (file.kind === "unsupported") return { content: `"${file.name}" is a ${file.mimeType} file that can't be read as text. Link: ${file.url}` };
        const note = file.truncated ? "\n\n[Only the first part of this file is shown; it is longer.]" : "";
        return { content: `"${file.name}" (${file.url})\n\n${file.text}${note}` };
      }
      case "present_reply_options": {
        const parsed = ReplyOptionsInput.safeParse(input);
        if (!parsed.success) {
          return { content: `Invalid input, fix and call again: ${parsed.error.message}`, isError: true };
        }
        const known = new Set(cfg.assets.map((a) => a.id));
        const unknown = parsed.data.options.flatMap((o) => o.asset_ids).filter((id) => !known.has(id));
        if (unknown.length) {
          return { content: `Unknown asset ids: ${unknown.join(", ")}. Use only ids from the asset library.`, isError: true };
        }
        emit({ type: "options", data: parsed.data });
        return { content: "The options are now shown to the user as cards." };
      }
      default:
        return { content: `Unknown tool ${name}`, isError: true };
    }
  } catch (err) {
    if (err instanceof z.ZodError) return { content: `Invalid input: ${err.message}`, isError: true };
    return { content: `Tool failed: ${errorMessage(err)}`, isError: true };
  }
}

// ---- Agent loop ---------------------------------------------------------------------------

const MAX_TURNS = 12;

/**
 * Runs one user turn to completion. Appends to `messages` in place (append-only, so the
 * conversation prefix stays byte-identical across turns for caching and preserved thinking).
 */
export async function runTurn(
  cfg: ClientConfig,
  system: string,
  messages: Anthropic.Beta.BetaMessageParam[],
  emit: (e: AssistantEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  let jsonRetries = 0;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const stream = client.beta.messages.stream(
      {
        model: MODEL,
        max_tokens: 64000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: EFFORT },
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        cache_control: { type: "ephemeral" },
        tools: TOOLS,
        messages,
      },
      { signal },
    );
    stream.on("text", (delta) => emit({ type: "text", delta }));

    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      // Only an unparseable streamed tool input is retried; API errors propagate.
      if (err instanceof Anthropic.APIError || signal?.aborted || jsonRetries++ >= 2) throw err;
      continue;
    }

    if (message.stop_reason === "refusal") {
      emit({ type: "notice", text: "The assistant declined to answer that. Try rephrasing the request." });
      return;
    }
    if (message.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: message.content });
      continue;
    }

    const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (message.stop_reason === "max_tokens" && toolUses.length) {
      throw new Error("The response was cut off mid-draft. Try asking for fewer options.");
    }
    messages.push({ role: "assistant", content: message.content });
    if (message.stop_reason !== "tool_use" || toolUses.length === 0) return;

    const outcomes = await Promise.all(toolUses.map((t) => runTool(cfg, t.name, t.input, emit)));
    messages.push({
      role: "user",
      content: toolUses.map((t, i) => ({
        type: "tool_result" as const,
        tool_use_id: t.id,
        content: outcomes[i].content,
        is_error: outcomes[i].isError || undefined,
      })),
    });
  }
  emit({ type: "notice", text: "Stopped after too many steps. Ask a narrower question." });
}

/** One cheap call to title a new chat from its first message. */
export async function titleFor(firstMessage: string): Promise<string> {
  const fallback = firstMessage.replace(/\s+/g, " ").slice(0, 60);
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      output_config: { effort: "low" },
      messages: [
        {
          role: "user",
          content: `Write a 3-6 word title for a chat that starts with the message below. Reply with the title only.\n\n<message>\n${firstMessage.slice(0, 2000)}\n</message>`,
        },
      ],
    });
    if (res.stop_reason === "refusal") return fallback;
    const text = res.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text.trim();
    return text ? text.replace(/^["']|["']$/g, "").slice(0, 80) : fallback;
  } catch {
    return fallback;
  }
}
