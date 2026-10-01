import express from "express";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import * as store from "./store.js";
import { publicPlan, summarize, statusLabel } from "./plans.js";
import { syncPlan, startScheduler } from "./sync.js";
import { generatePlan } from "./generator.js";
import { ordinal } from "./ordinal/index.js";
import { runChat, chatEnabled } from "./chat/agent.js";
import { fns } from "./chat/tools.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, "..", "public");
const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

store.init();
const app = express();
app.use(express.json({ limit: "256kb" }));

// ---------- access ----------
// Team: HTTP basic auth with ADMIN_PASSWORD (open when unset, for local demos).
// Client: the plan's share link carries ?k=<shareToken>.
function isTeam(req) {
  if (!ADMIN_PASSWORD) return true;
  const h = req.headers.authorization || "";
  if (!h.startsWith("Basic ")) return false;
  const pass = Buffer.from(h.slice(6), "base64").toString().split(":").slice(1).join(":");
  const a = Buffer.from(pass);
  const b = Buffer.from(ADMIN_PASSWORD);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireTeam(req, res, next) {
  if (isTeam(req)) return next();
  res.set("WWW-Authenticate", 'Basic realm="RevBoss team"').status(401).send("Team login required");
}

function tokenOk(plan, k) {
  if (!k || !plan.shareToken) return false;
  const a = Buffer.from(String(k));
  const b = Buffer.from(plan.shareToken);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Loads the plan and works out who is looking: "team" or "client".
function withPlan(req, res, next) {
  const plan = store.getPlan(req.params.id);
  if (!plan) return res.status(404).json({ error: "plan not found" });
  const k = req.query.k || req.get("x-plan-key");
  if (tokenOk(plan, k)) req.viewer = "client";
  else if (req.get("x-viewer") === "team" && isTeam(req)) req.viewer = "team";
  else if (!k && isTeam(req)) req.viewer = "team";
  else return res.status(403).json({ error: "This link is not valid for this plan." });
  req.plan = plan;
  next();
}

const shareUrl = (req, plan) => `${req.protocol}://${req.get("host")}/p/${plan.id}?k=${plan.shareToken}`;

// ---------- pages ----------
app.get("/", requireTeam, (req, res) => res.sendFile(path.join(PUBLIC, "index.html")));
app.get("/p/:id", (req, res) => res.sendFile(path.join(PUBLIC, "plan.html")));
app.get("/team/p/:id", requireTeam, (req, res) => res.sendFile(path.join(PUBLIC, "plan.html")));
app.use(express.static(PUBLIC, { index: false }));

// ---------- API ----------
app.get("/api/health", (req, res) =>
  res.json({ ok: true, ordinal: ordinal.name, chat: chatEnabled ? "claude" : "offline", plans: store.listPlans().length }),
);

app.get("/api/plans", requireTeam, (req, res) => {
  res.json({
    ordinal: ordinal.name,
    chat: chatEnabled ? "claude" : "offline",
    plans: store.listPlans().map((p) => ({
      id: p.id, client: p.client, person: p.person, month: p.month, framework: p.framework,
      draft: !!p.draft, lastSyncedAt: p.lastSyncedAt || null, updatedAt: p.updatedAt,
      shareUrl: shareUrl(req, p), summary: summarize(p),
      newFeedback: p.feedback.filter((f) => !f.resolved).length,
    })),
  });
});

app.get("/api/plans/:id", withPlan, (req, res) => {
  res.json({ viewer: req.viewer, ordinal: ordinal.name, chat: chatEnabled ? "claude" : "offline", plan: publicPlan(req.plan), ...(req.viewer === "team" ? { shareUrl: shareUrl(req, req.plan) } : {}) });
});

// Live updates: every change to the plan is pushed to everyone viewing it.
app.get("/api/plans/:id/stream", withPlan, (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.flushHeaders();
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const onChange = ({ planId, change }) => {
    if (planId !== req.plan.id || change?.silent) return;
    send("plan", { plan: publicPlan(store.getPlan(planId)), change });
  };
  store.changes.on("change", onChange);
  const ping = setInterval(() => res.write(": ping\n\n"), 25000);
  req.on("close", () => {
    clearInterval(ping);
    store.changes.off("change", onChange);
  });
});

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.post("/api/plans/:id/sync", withPlan, wrap(async (req, res) => {
  res.json(await syncPlan(req.plan.id));
}));

app.post("/api/plans/:id/asks/:index", withPlan, (req, res) => {
  const out = fns.completeAsk(req.plan.id, { index: Number(req.params.index), done: req.body.done !== false });
  res.status(out.error ? 400 : 200).json(out);
});

app.post("/api/plans/:id/feedback", withPlan, wrap(async (req, res) => {
  const message = String(req.body.message || "").trim();
  if (!message) return res.status(400).json({ error: "message required" });
  const author = req.viewer === "team" ? "RevBoss team" : req.plan.person;
  res.json(await fns.leaveFeedback(req.plan.id, { post: req.body.postId, message: message.slice(0, 2000), author }));
}));

// Team edits to the narrative and to individual rows.
const PLAN_FIELDS = ["intro", "waitingOn", "angles", "sections", "cta", "bookingUrl", "draft", "periodLabel"];
app.patch("/api/plans/:id", requireTeam, withPlan, (req, res) => {
  const plan = store.updatePlan(req.plan.id, (p) => {
    for (const f of PLAN_FIELDS) if (f in req.body) p[f] = req.body[f];
    return { kind: "edit", text: req.body.draft === false ? "Plan published to client" : "Plan updated by RevBoss" };
  });
  res.json({ plan: publicPlan(plan) });
});

const POST_FIELDS = ["title", "angle", "topicTag", "type", "date", "note"];
app.patch("/api/plans/:id/posts/:postId", requireTeam, withPlan, (req, res) => {
  const plan = store.updatePlan(req.plan.id, (p) => {
    const post = p.posts.find((x) => x.id === req.params.postId);
    if (!post) throw Object.assign(new Error("post not found"), { status: 404 });
    for (const f of POST_FIELDS) if (f in req.body) post[f] = req.body[f];
    return { kind: "edit", text: `Updated "${post.title}"` };
  });
  res.json({ plan: publicPlan(plan) });
});

app.post("/api/plans/:id/feedback/:fid/resolve", requireTeam, withPlan, (req, res) => {
  const plan = store.updatePlan(req.plan.id, (p) => {
    const f = p.feedback.find((x) => x.id === req.params.fid);
    if (!f) return null;
    f.resolved = true;
    return { kind: "feedback", text: "Feedback resolved", silent: true };
  });
  res.json({ ok: true, plan: publicPlan(plan) });
});

app.post("/api/plans/generate", requireTeam, wrap(async (req, res) => {
  const plan = await generatePlan(req.body || {});
  res.json({ plan: publicPlan(plan), shareUrl: shareUrl(req, plan) });
}));

// Demo only: play the client approving the next waiting post, to show live updates.
app.post("/api/plans/:id/demo/approve-next", requireTeam, withPlan, (req, res) => {
  if (ordinal.live) return res.status(400).json({ error: "demo mode only" });
  const plan = store.updatePlan(req.plan.id, (p) => {
    const post = p.posts.filter((x) => x.status === "approval_waiting").sort((a, b) => a.date.localeCompare(b.date))[0];
    if (!post) return null;
    post.status = "scheduled";
    post.statusLabel = statusLabel("scheduled");
    return { kind: "status", text: `"${post.title}" approved in Ordinal — now Scheduled`, postId: post.id };
  });
  res.json({ plan: publicPlan(plan) });
});

// Chat: streams Server-Sent Events back on the POST response.
app.post("/api/plans/:id/chat", withPlan, async (req, res) => {
  const message = String(req.body.message || "").trim().slice(0, 4000);
  if (!message) return res.status(400).json({ error: "message required" });
  const history = (Array.isArray(req.body.history) ? req.body.history : [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" });
  res.flushHeaders();
  const emit = (e) => res.write(`data: ${JSON.stringify(e)}\n\n`);
  try {
    await runChat({ planId: req.plan.id, history, message, viewer: req.viewer, emit });
    emit({ type: "done" });
  } catch (err) {
    console.error("[chat]", err);
    emit({ type: "error", message: "The assistant hit a problem. Try again in a moment." });
  }
  res.end();
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "server error" });
});

app.listen(PORT, () => {
  console.log(`Content plan portal on http://localhost:${PORT}  (ordinal: ${ordinal.name}, chat: ${chatEnabled ? "claude" : "offline"})`);
  if (!ADMIN_PASSWORD) console.log("ADMIN_PASSWORD not set: the team dashboard is open. Set it before sharing the URL.");
  startScheduler();
});

