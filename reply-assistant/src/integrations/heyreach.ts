import type { ClientConfig } from "../types.ts";

// Thin client for the HeyReach public API (https://api.heyreach.io/api/public, X-API-KEY auth).

const BASE_URL = process.env.HEYREACH_BASE_URL ?? "https://api.heyreach.io/api/public";

export class HeyReachError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface HeyReachMessage {
  createdAt: string;
  body: string | null;
  subject: string | null;
  isInMail: boolean;
  isVoiceNote: boolean;
  transcript: string | null;
  sender: "ME" | "CORRESPONDENT" | string;
}

interface HeyReachConversation {
  id: string;
  read: boolean;
  lastMessageAt: string;
  lastMessageText: string | null;
  lastMessageSender: string;
  totalMessages: number;
  linkedInAccountId: number;
  correspondentProfile: {
    firstName: string;
    lastName: string;
    headline: string | null;
    companyName: string | null;
    position: string | null;
    location: string | null;
    profileUrl: string;
    emailAddress?: string | null;
  };
  linkedInAccount?: { id: number; firstName: string; lastName: string };
  messages?: HeyReachMessage[];
}

export function heyReachConfigured(client: ClientConfig): boolean {
  return Boolean(client.heyreach && process.env[client.heyreach.apiKeyEnv]);
}

async function call<T>(client: ClientConfig, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const cfg = client.heyreach;
  const apiKey = cfg ? process.env[cfg.apiKeyEnv] : undefined;
  if (!cfg || !apiKey) throw new HeyReachError(0, `HeyReach is not configured for ${client.name}`);
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) throw new HeyReachError(res.status, `HeyReach ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

function formatMessage(m: HeyReachMessage): string {
  const who = m.sender === "ME" ? "US" : "THEM";
  const voice = m.isVoiceNote ? ` [voice note]${m.transcript ? ` transcript: ${m.transcript}` : ""}` : "";
  const subject = m.subject ? ` (subject: ${m.subject})` : "";
  return `[${m.createdAt}] ${who}${subject}: ${m.body ?? ""}${voice}`;
}

function summarize(c: HeyReachConversation) {
  const p = c.correspondentProfile;
  return {
    account_id: c.linkedInAccountId,
    conversation_id: c.id,
    lead: `${p.firstName} ${p.lastName}`.trim(),
    headline: p.headline,
    company: p.companyName,
    sender: c.linkedInAccount ? `${c.linkedInAccount.firstName} ${c.linkedInAccount.lastName}` : undefined,
    last_message_at: c.lastMessageAt,
    last_message_from: c.lastMessageSender === "ME" ? "us" : "them",
    last_message: c.lastMessageText,
    unread: !c.read,
    total_messages: c.totalMessages,
  };
}

export async function listConversations(
  client: ClientConfig,
  opts: { search?: string; unreadOnly?: boolean; repliesOnly?: boolean; limit?: number },
) {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
  const accountIds = client.heyreach?.linkedInAccountIds ?? [];
  const data = await call<{ totalCount: number; items: HeyReachConversation[] }>(client, "POST", "/inbox/GetConversationsV2", {
    filters: {
      linkedInAccountIds: accountIds.length ? accountIds : null,
      searchString: opts.search || null,
      seen: opts.unreadOnly ? false : null,
    },
    offset: 0,
    limit,
  });
  let items = data.items.map(summarize);
  if (opts.repliesOnly) items = items.filter((c) => c.last_message_from === "them");
  return { total: data.totalCount, conversations: items };
}

export async function getConversation(client: ClientConfig, accountId: number, conversationId: string) {
  const allowed = client.heyreach?.linkedInAccountIds ?? [];
  if (allowed.length && !allowed.includes(accountId)) {
    throw new HeyReachError(403, `LinkedIn account ${accountId} is not assigned to ${client.name}`);
  }
  const c = await call<HeyReachConversation>(
    client,
    "GET",
    `/inbox/GetChatroom/${accountId}/${encodeURIComponent(conversationId)}`,
  );
  const p = c.correspondentProfile;
  return {
    ...summarize(c),
    lead_profile: {
      name: `${p.firstName} ${p.lastName}`.trim(),
      headline: p.headline,
      position: p.position,
      company: p.companyName,
      location: p.location,
      profile_url: p.profileUrl,
      email: p.emailAddress ?? null,
    },
    thread: (c.messages ?? []).map(formatMessage).join("\n"),
  };
}

export async function sendMessage(
  client: ClientConfig,
  args: { accountId: number; conversationId: string; message: string; subject?: string },
) {
  if (!client.heyreach?.allowSend) throw new HeyReachError(403, `Sending is disabled for ${client.name}`);
  const allowed = client.heyreach.linkedInAccountIds;
  if (allowed.length && !allowed.includes(args.accountId)) {
    throw new HeyReachError(403, `LinkedIn account ${args.accountId} is not assigned to ${client.name}`);
  }
  await call(client, "POST", "/inbox/SendMessage", {
    message: args.message,
    subject: args.subject ?? "",
    conversationId: args.conversationId,
    linkedInAccountId: args.accountId,
  });
  return { sent: true };
}
