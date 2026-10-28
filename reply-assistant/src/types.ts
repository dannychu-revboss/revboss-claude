import type Anthropic from "@anthropic-ai/sdk";

export type AssetType = "one_sheet" | "lead_magnet" | "tear_sheet" | "case_study" | "other";

/** A piece of collateral the assistant can recommend (usually a Google Drive link). */
export interface Asset {
  id: string;
  type: AssetType;
  title: string;
  description: string;
  url: string;
  /** Optional Drive file ID so the assistant can read the asset's contents. */
  driveFileId?: string;
  /** Plain-language guidance on when this asset fits. */
  whenToUse?: string;
}

export interface Template {
  id: string;
  name: string;
  channel: "linkedin" | "email" | "any";
  /** Message body. Supports {{first_name}}, {{company}}, {{calendar_link}} etc. as hints for the model. */
  body: string;
  notes?: string;
}

/** One way to respond to a matched scenario: a template, assets to attach, and guidance. */
export interface MatrixOption {
  label: string;
  templateId?: string;
  assetIds: string[];
  guidance?: string;
}

/**
 * The follow-up matrix: "if the reply looks like X, do one of these options".
 */
export interface MatrixRule {
  id: string;
  scenario: string;
  intent: "positive" | "curious" | "objection" | "timing" | "referral" | "negative" | "out_of_office" | "other";
  /** Example phrases / signals that indicate this scenario. */
  signals: string[];
  /** What a good follow-up should achieve. */
  goal: string;
  options: MatrixOption[];
  /** Things to avoid for this scenario. */
  avoid?: string;
}

export interface KnowledgeDoc {
  id: string;
  title: string;
  kind: "call_transcript" | "notes" | "faq" | "other";
  text: string;
  addedAt: string;
}

export interface ClientConfig {
  id: string;
  name: string;
  active: boolean;
  /** Secret used in the client's chat link. Never sent to the model. */
  accessToken: string;
  profile: {
    company: string;
    offer: string;
    audience: string;
    voice: string;
    signature?: string;
    calendarLink?: string;
  };
  heyreach?: {
    /** Name of the env var holding this client's HeyReach API key (keys are never stored in data files). */
    apiKeyEnv: string;
    /** Restrict the inbox to these sender accounts. Empty = all accounts in the workspace. */
    linkedInAccountIds: number[];
    /** Allow sending from the chat UI (always requires an explicit click + confirm). */
    allowSend: boolean;
  };
  drive?: {
    /** Drive folders shared with the service account that hold this client's collateral. */
    folderIds: string[];
  };
  assets: Asset[];
  templates: Template[];
  matrix: MatrixRule[];
  knowledge: KnowledgeDoc[];
}

/** What the browser renders for a past message. */
export type DisplayItem =
  | { kind: "user"; text: string; at: string }
  | { kind: "assistant"; text: string; at: string }
  | { kind: "options"; data: ReplyOptions; at: string }
  | { kind: "tool"; label: string; at: string };

export interface ReplyOptions {
  matched_rule_id: string;
  scenario: string;
  reply_summary: string;
  confidence: "high" | "medium" | "low";
  conversation: { account_id: number; conversation_id: string; lead_name: string } | null;
  options: Array<{
    label: string;
    channel: "linkedin" | "email";
    subject: string;
    message: string;
    asset_ids: string[];
    why: string;
  }>;
}

export interface Transcript {
  id: string;
  clientId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  display: DisplayItem[];
  /**
   * System prompt snapshotted when the chat started. Resumed chats reuse it byte-for-byte so the
   * conversation prefix (and its cache + thinking blocks) stays valid; matrix edits apply to new chats.
   */
  system: string;
  /** Full API history (append-only) so a conversation can be resumed. */
  apiMessages: Anthropic.Beta.BetaMessageParam[];
}
