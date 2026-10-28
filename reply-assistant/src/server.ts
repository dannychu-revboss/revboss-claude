import express, { type Request, type Response, type NextFunction } from "express";
import crypto from "node:crypto";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { PORT, ROOT, adminToken } from "./config.ts";
import * as store from "./store.ts";
import { buildSystemPrompt } from "./prompt.ts";
import { runTurn, titleFor, type AssistantEvent } from "./assistant.ts";
import { ClientSchema } from "./schema.ts";
import * as heyreach from "./integrations/heyreach.ts";
import * as drive from "./integrations/drive.ts";
import type { ClientConfig, Transcript } from "./types.ts";

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(ROOT, "public")));

// ---- Auth ---------------------------------------------------------------------------------
// Admins (RevBoss team) use ADMIN_TOKEN. Each client gets its own access token, shared as a
// chat link (/?client=<id>#token=<token>), which only opens that client's assistant.

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function bearer(req: Request): string {
  const h = req.get("authorization") ?? "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}

function isAdmin(req: Request): boolean {
  const admin = adminToken();
  const token = bearer(req);
  return Boolean(admin && token && safeEqual(token, admin));
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!isAdmin(req)) return void res.status(401).json({ error: "admin token required" });
  next();
}

/** Loads the client in :clientId and checks the caller may use it. */
async function loadClient(req: Request, res: Response): Promise<ClientConfig | null> {
  const cfg = await store.getClient(String(req.params.clientId));
  const token = bearer(req);
  const ok = cfg && (isAdmin(req) || (cfg.active && token && safeEqual(token, cfg.accessToken)));
  if (!cfg || !ok) {
    res.status(401).json({ error: "invalid client link" });
    return null;
  }
  return cfg;
}

function publicView(cfg: ClientConfig) {
  return {
    id: cfg.id,
    name: cfg.name,
    features: {
      heyreach: heyreach.heyReachConfigured(cfg),
      send: heyreach.heyReachConfigured(cfg) && Boolean(cfg.heyreach?.allowSend),
      drive: drive.driveConfigured(cfg),
    },
    assets: cfg.assets.map(({ id, type, title, url, description }) => ({ id, type, title, url, description })),
    scenarios: cfg.matrix.map(({ id, scenario, intent }) => ({ id, scenario, intent })),
  };
}

function sendError(res: Response, err: unknown) {
  if (err instanceof heyreach.HeyReachError) return void res.status(err.status || 502).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: err instanceof Error ? err.message : "server error" });
}

// ---- Client-facing API ----------------------------------------------------------------------

app.get("/api/clients/:clientId", async (req, res) => {
  const cfg = await loadClient(req, res);
  if (cfg) res.json(publicView(cfg));
});

app.get("/api/clients/:clientId/inbox", async (req, res) => {
  const cfg = await loadClient(req, res);
  if (!cfg) return;
  if (!heyreach.heyReachConfigured(cfg)) return void res.json({ total: 0, conversations: [] });
  try {
    res.json(
      await heyreach.listConversations(cfg, {
        repliesOnly: req.query.replies_only !== "false",
        search: typeof req.query.search === "string" ? req.query.search : undefined,
        limit: 30,
      }),
    );
  } catch (err) {
    sendError(res, err);
  }
});

app.post("/api/clients/:clientId/heyreach/send", async (req, res) => {
  const cfg = await loadClient(req, res);
  if (!cfg) return;
  const { account_id, conversation_id, message, subject } = req.body ?? {};
  if (!Number.isInteger(account_id) || typeof conversation_id !== "string" || typeof message !== "string" || !message.trim()) {
    return void res.status(400).json({ error: "account_id, conversation_id and message are required" });
  }
  try {
    res.json(await heyreach.sendMessage(cfg, { accountId: account_id, conversationId: conversation_id, message, subject }));
  } catch (err) {
    sendError(res, err);
  }
});

app.get("/api/clients/:clientId/transcripts", async (req, res) => {
  const cfg = await loadClient(req, res);
  if (cfg) res.json(await store.listTranscripts(cfg.id));
});

app.get("/api/clients/:clientId/transcripts/:tid", async (req, res) => {
  const cfg = await loadClient(req, res);
  if (!cfg) return;
  const t = await store.getTranscript(cfg.id, String(req.params.tid));
  if (!t) return void res.status(404).json({ error: "not found" });
  res.json({ id: t.id, title: t.title, createdAt: t.createdAt, updatedAt: t.updatedAt, display: t.display });
});

app.delete("/api/clients/:clientId/transcripts/:tid", async (req, res) => {
  const cfg = await loadClient(req, res);
  if (!cfg) return;
  await store.deleteTranscript(cfg.id, String(req.params.tid));
  res.json({ ok: true });
});

app.get("/api/clients/:clientId/transcripts/:tid/export", async (req, res) => {
  const cfg = await loadClient(req, res);
  if (!cfg) return;
  const t = await store.getTranscript(cfg.id, String(req.params.tid));
  if (!t) return void res.status(404).json({ error: "not found" });
  res.type("text/markdown").attachment(`${t.id}.md`).send(transcriptMarkdown(cfg, t));
});

function transcriptMarkdown(cfg: ClientConfig, t: Transcript): string {
  const assets = new Map(cfg.assets.map((a) => [a.id, a]));
  const lines = [`# ${t.title}`, ``, `${cfg.name} · started ${t.createdAt}`, ``];
  for (const item of t.display) {
    if (item.kind === "user") lines.push(`**You:** ${item.text}`, "");
    else if (item.kind === "assistant") lines.push(`**Assistant:** ${item.text}`, "");
    else if (item.kind === "tool") lines.push(`_${item.label}_`, "");
    else {
      const d = item.data;
      lines.push(`**Scenario:** ${d.scenario} (${d.confidence} confidence) — ${d.reply_summary}`, "");
      d.options.forEach((o, i) => {
        lines.push(`${i + 1}. **${o.label}** (${o.channel})${o.subject ? ` — subject: ${o.subject}` : ""}`, "");
        lines.push(...o.message.split("\n").map((l) => `   > ${l}`), "");
        const links = o.asset_ids.map((id) => assets.get(id)).filter(Boolean).map((a) => `[${a!.title}](${a!.url})`);
        if (links.length) lines.push(`   Assets: ${links.join(", ")}`, "");
      });
    }
  }
  return lines.join("\n");
}

const busy = new Set<string>();

app.post("/api/clients/:clientId/chat", async (req, res) => {
  const cfg = await loadClient(req, res);
  if (!cfg) return;
  const text = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!text) return void res.status(400).json({ error: "message is required" });

  const now = new Date().toISOString();
  let t: Transcript | null = null;
  if (req.body.transcriptId) {
    t = await store.getTranscript(cfg.id, String(req.body.transcriptId));
    if (!t) return void res.status(404).json({ error: "chat not found" });
  } else {
    t = {
      id: store.newId("chat"),
      clientId: cfg.id,
      title: text.replace(/\s+/g, " ").slice(0, 60),
      createdAt: now,
      updatedAt: now,
      display: [],
      system: buildSystemPrompt(cfg),
      apiMessages: [],
    };
  }
  const lockKey = `${cfg.id}/${t.id}`;
  if (busy.has(lockKey)) return void res.status(409).json({ error: "this chat is already answering" });
  busy.add(lockKey);

  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const abort = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) abort.abort();
  });

  const isNew = t.apiMessages.length === 0;
  const historyLength = t.apiMessages.length;
  t.display.push({ kind: "user", text, at: now });
  t.apiMessages.push({ role: "user", content: text });
  send("start", { transcriptId: t.id });

  let assistantText = "";
  const flushText = () => {
    if (assistantText.trim()) t!.display.push({ kind: "assistant", text: assistantText.trim(), at: new Date().toISOString() });
    assistantText = "";
  };
  const emit = (e: AssistantEvent) => {
    const at = new Date().toISOString();
    if (e.type === "text") assistantText += e.delta;
    else {
      flushText();
      if (e.type === "tool") t!.display.push({ kind: "tool", label: e.label, at });
      if (e.type === "options") t!.display.push({ kind: "options", data: e.data, at });
      if (e.type === "notice") t!.display.push({ kind: "assistant", text: e.text, at });
    }
    send(e.type, e);
  };

  try {
    const titlePromise = isNew ? titleFor(text) : null;
    await runTurn(cfg, t.system, t.apiMessages, emit, abort.signal);
    flushText();
    if (titlePromise) t.title = await titlePromise;
    t.updatedAt = new Date().toISOString();
    await store.saveTranscript(t);
    send("done", { transcriptId: t.id, title: t.title });
  } catch (err) {
    // Roll the API history back to before this turn so the saved chat can always be resumed.
    t.apiMessages.length = historyLength;
    t.display.push({ kind: "assistant", text: "(This answer failed. Your message is saved; try sending it again.)", at: new Date().toISOString() });
    t.updatedAt = new Date().toISOString();
    if (!isNew) await store.saveTranscript(t).catch(() => {});
    const message =
      err instanceof Anthropic.RateLimitError
        ? "The assistant is busy right now. Try again in a minute."
        : err instanceof Anthropic.APIError
          ? `The assistant hit an error (${err.status}). Try again.`
          : err instanceof Error
            ? err.message
            : "Something went wrong.";
    if (!abort.signal.aborted) {
      console.error(err);
      send("error", { error: message });
    }
  } finally {
    busy.delete(lockKey);
    res.end();
  }
});

// ---- Admin API (RevBoss team) ---------------------------------------------------------------

app.get("/api/admin/clients", requireAdmin, async (_req, res) => {
  res.json(await store.listClients());
});

app.post("/api/admin/clients", requireAdmin, async (req, res) => {
  const { id, name } = req.body ?? {};
  if (typeof id !== "string" || !store.isValidId(id) || typeof name !== "string" || !name.trim()) {
    return void res.status(400).json({ error: "id (lowercase, no spaces) and name are required" });
  }
  if (await store.getClient(id)) return void res.status(409).json({ error: "a client with that id exists" });
  const cfg: ClientConfig = {
    id,
    name: name.trim(),
    active: true,
    accessToken: store.newAccessToken(),
    profile: { company: name.trim(), offer: "", audience: "", voice: "" },
    assets: [],
    templates: [],
    matrix: [],
    knowledge: [],
  };
  await store.saveClient(cfg);
  res.status(201).json(cfg);
});

app.get("/api/admin/clients/:clientId", requireAdmin, async (req, res) => {
  const cfg = await store.getClient(String(req.params.clientId));
  if (!cfg) return void res.status(404).json({ error: "not found" });
  res.json(cfg);
});

app.put("/api/admin/clients/:clientId", requireAdmin, async (req, res) => {
  const existing = await store.getClient(String(req.params.clientId));
  if (!existing) return void res.status(404).json({ error: "not found" });
  const parsed = ClientSchema.safeParse({ ...req.body, id: existing.id, accessToken: existing.accessToken });
  if (!parsed.success) {
    return void res.status(400).json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
  }
  await store.saveClient(parsed.data);
  res.json(parsed.data);
});

app.post("/api/admin/clients/:clientId/rotate-token", requireAdmin, async (req, res) => {
  const cfg = await store.getClient(String(req.params.clientId));
  if (!cfg) return void res.status(404).json({ error: "not found" });
  cfg.accessToken = store.newAccessToken();
  await store.saveClient(cfg);
  res.json({ accessToken: cfg.accessToken });
});

app.delete("/api/admin/clients/:clientId", requireAdmin, async (req, res) => {
  await store.deleteClient(String(req.params.clientId));
  res.json({ ok: true });
});

app.get("/api/admin/clients/:clientId/drive-search", requireAdmin, async (req, res) => {
  const cfg = await store.getClient(String(req.params.clientId));
  if (!cfg) return void res.status(404).json({ error: "not found" });
  if (!drive.driveConfigured(cfg)) return void res.status(400).json({ error: "Drive is not configured for this client" });
  try {
    res.json(await drive.searchFiles(cfg, typeof req.query.q === "string" ? req.query.q : "", 25));
  } catch (err) {
    sendError(res, err);
  }
});

if (!adminToken()) console.warn("ADMIN_TOKEN is not set: the admin UI is disabled.");
app.listen(PORT, () => console.log(`Reply Assistant listening on http://localhost:${PORT}`));
