// Builds dist/content-plan-demo.html: one self-contained file that runs the
// real client/team page in any browser with no server. All 19 plans and their
// demo metrics are embedded; the API is answered in-page, changes persist in
// localStorage, and two open tabs stay in sync (BroadcastChannel), so the live
// updates can be shown too. Usage: npm run build:demo
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Load the seed plans through the real store + demo sync so metrics are filled in.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cpp-demo-"));
fs.cpSync(path.join(root, "data/seed"), path.join(tmp, "seed"), { recursive: true });
process.env.DATA_DIR = tmp;
delete process.env.ORDINAL_MCP_URL;
const store = await import("../server/store.js");
const { syncPlan } = await import("../server/sync.js");
store.init();
for (const p of store.listPlans()) await syncPlan(p.id);
const plans = store.listPlans().map(({ shareToken, activity, ...p }) => ({ ...p, activity: [] }));

const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const plansLib = read("server/plans.js").replace(/^export /gm, "");
const logo = `data:image/png;base64,${fs.readFileSync(path.join(root, "public/revboss-logo.png")).toString("base64")}`;

const shim = `
(() => {
${plansLib}
const SEED = ${JSON.stringify(plans)};
const KEY = "cpp-demo:v1";
let db;
try { db = JSON.parse(localStorage.getItem(KEY) || "null"); } catch {}
if (!db || db.version !== ${JSON.stringify(new Date().toISOString().slice(0, 10))}) db = { version: ${JSON.stringify(new Date().toISOString().slice(0, 10))}, plans: Object.fromEntries(SEED.map((p) => [p.id, p])) };
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {} };

const hash = new URLSearchParams(location.hash.slice(1));
const ids = Object.keys(db.plans).sort((a, b) => (db.plans[a].client + db.plans[a].person).localeCompare(db.plans[b].client + db.plans[b].person));
const planId = db.plans[hash.get("plan")] ? hash.get("plan") : ids.find((i) => i.includes("whitney")) || ids[0];
const viewer = hash.get("as") === "team" ? "team" : "client";
const plan = () => db.plans[planId];

// ---- live updates: in-page listeners + other tabs
const listeners = new Set();
const bc = "BroadcastChannel" in window ? new BroadcastChannel("cpp-demo") : null;
function emit(change) {
  plan().updatedAt = new Date().toISOString();
  save();
  const data = JSON.stringify({ plan: publicPlan(plan()), change });
  listeners.forEach((fn) => fn(data));
  bc?.postMessage({ planId, saved: plan(), change });
}
bc && (bc.onmessage = (e) => {
  if (e.data.planId !== planId) return;
  db.plans[planId] = e.data.saved;
  const data = JSON.stringify({ plan: publicPlan(plan()), change: e.data.change });
  listeners.forEach((fn) => fn(data));
});
window.EventSource = class {
  constructor() { this._h = {}; setTimeout(() => this.onopen && this.onopen(), 50); }
  addEventListener(type, fn) { if (type === "plan") { this._fn = (d) => fn({ data: d }); listeners.add(this._fn); } }
  close() { listeners.delete(this._fn); }
};

// ---- the API, answered in-page (mirrors server/index.js)
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const author = () => (viewer === "team" ? "RevBoss team" : plan().person);
function addFeedback(post, message, silent) {
  const item = { id: "f" + Date.now().toString(36), at: new Date().toISOString(), postId: post?.id || null, postTitle: post?.title || null, message, author: author(), sentToOrdinal: false, resolved: false };
  plan().feedback.unshift(item);
  if (!silent) emit({ kind: "feedback", text: author() + " left feedback" + (post ? ' on "' + post.title + '"' : "") });
  return item;
}
const routes = {
  "GET ": () => json({ viewer, ordinal: "demo", chat: "offline", plan: publicPlan(plan()), shareUrl: location.href.split("#")[0] + "#plan=" + planId }),
  "POST /sync": () => { emit({ kind: "sync", text: "Synced with Ordinal (demo)" }); return json({ checked: plan().posts.length, errors: [] }); },
  "POST /asks/:i": (b, [i]) => { const a = plan().waitingOn[+i]; if (!a) return json({ error: "no ask" }, 400); a.done = b.done !== false; emit({ kind: "ask", text: (a.done ? "Done: " : "Reopened: ") + a.ask }); return json({ ok: true }); },
  "POST /feedback": (b) => json({ saved: true, item: addFeedback(findPost(plan(), b.postId), String(b.message || "").slice(0, 2000)) }),
  "POST /feedback/:f/resolve": (b, [f]) => { const x = plan().feedback.find((y) => y.id === f); if (x) x.resolved = true; emit(null); return json({ ok: true }); },
  "PATCH ": (b) => { for (const k of ["intro", "waitingOn", "angles", "sections", "cta", "bookingUrl", "draft"]) if (k in b) plan()[k] = b[k]; emit({ kind: "edit", text: b.draft === false ? "Plan published to client" : "Plan updated by RevBoss" }); return json({}); },
  "PATCH /posts/:p": (b, [pid]) => {
    const post = plan().posts.find((x) => x.id === pid); const from = post.angle;
    for (const k of ["title", "angle", "topicTag", "type", "date"]) if (k in b) post[k] = b[k];
    for (const r of plan().angleRequests) if (r.postId === pid && r.status === "pending") r.status = r.toAngle === post.angle ? "approved" : "declined";
    emit({ kind: "edit", text: from !== post.angle ? 'Moved "' + post.title + '" from ' + from + " to " + post.angle : 'Updated "' + post.title + '"' });
    return json({});
  },
  "POST /demo/approve-next": () => {
    const post = plan().posts.filter((x) => x.status === "approval_waiting").sort((a, b) => a.date.localeCompare(b.date))[0];
    if (!post) return json({});
    post.status = "scheduled"; post.statusLabel = "Scheduled";
    emit({ kind: "status", text: '"' + post.title + '" approved in Ordinal — now Scheduled' });
    return json({});
  },
  "POST /angle-requests": (b) => {
    const p = plan(), post = findPost(p, b.postId), to = p.angles.find((a) => a.name === b.toAngle);
    if (!post || !to || to.name === post.angle) return json({ error: "Can't request that move." }, 400);
    const fb = addFeedback(post, 'Please move "' + post.title + '" from ' + post.angle + " to " + to.name + "." + (b.note ? " " + b.note : ""), true);
    p.angleRequests.forEach((r) => { if (r.postId === post.id && r.status === "pending") r.status = "replaced"; });
    p.angleRequests.unshift({ id: "r" + Date.now().toString(36), at: new Date().toISOString(), postId: post.id, postTitle: post.title, fromAngle: post.angle, toAngle: to.name, note: b.note || "", author: author(), status: "pending", feedbackId: fb.id });
    emit({ kind: "angle_request", text: author() + ' asked to move "' + post.title + '" to ' + to.name });
    return json({ saved: true });
  },
  "POST /angle-requests/:r": (b, [rid]) => {
    const p = plan(), r = p.angleRequests.find((x) => x.id === rid);
    if (!r || r.status !== "pending") return json({ error: "That request is no longer open." }, 409);
    r.status = b.decision === "approve" ? "approved" : "declined";
    if (r.status === "approved") p.posts.find((x) => x.id === r.postId).angle = r.toAngle;
    const fb = p.feedback.find((f) => f.id === r.feedbackId); if (fb) fb.resolved = true;
    emit({ kind: "angle_request", text: r.status === "approved" ? 'Moved "' + r.postTitle + '" to ' + r.toAngle + ", as requested" : 'Kept "' + r.postTitle + '" in ' + r.fromAngle + " for now" });
    return json({ ok: true });
  },
  "POST /chat": (b) => {
    const text = offlineAnswer(String(b.message || ""));
    const body = new ReadableStream({ start(c) { const e = new TextEncoder(); c.enqueue(e.encode("data: " + JSON.stringify({ type: "text", text }) + "\\n\\n")); c.enqueue(e.encode('data: {"type":"done"}\\n\\n')); c.close(); } });
    return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
  },
};
function offlineAnswer(q) {
  const p = publicPlan(plan()), s = p.summary; q = q.toLowerCase();
  let t;
  if (/(wait|need|approv|ask|me to)/.test(q)) {
    const asks = p.waitingOn.filter((a) => !a.done);
    const pend = p.posts.filter((x) => x.effectiveStatus === "approval_waiting" || x.effectiveStatus === "approval_overdue").sort((a, b) => a.date.localeCompare(b.date));
    t = (asks.length ? "Open asks:\\n" + asks.map((a) => "- " + (a.when ? a.when + ": " : "") + a.ask).join("\\n") + "\\n\\n" : "No open asks right now.\\n\\n") +
      (pend.length ? pend.length + " post" + (pend.length > 1 ? "s" : "") + ' waiting on approval in Ordinal, starting with ' + fmtDate(pend[0].date) + ' "' + pend[0].title + '".' : "Nothing is waiting on approval.");
  } else if (/(perform|doing|impression|engag|metric|number|best|top)/.test(q)) {
    const m = p.posts.filter((x) => x.metrics).sort((a, b) => b.metrics.impressions - a.metrics.impressions);
    t = m.length ? m.length + " published so far: " + s.impressions.toLocaleString() + " impressions, " + s.engagements + " engagements. Top: \\"" + m[0].title + "\\" (" + m[0].metrics.impressions + " impressions). Demo numbers." : "Nothing has published yet this month.";
  } else if (/(angle|pillar).*(most|count)|most.*(angle|pillar)/.test(q)) {
    const a = [...s.angles].sort((x, y) => y.planned - x.planned)[0];
    t = a.name + " has the most posts: " + a.planned + " of " + s.total + ".";
  } else if (/(change|move|edit|swap)/.test(q)) {
    t = "Open the post and use “Send to RevBoss”, or drag it to another column on the Board view (grouped by " + p.angleWord.toLowerCase() + ") to ask for a different " + p.angleWord.toLowerCase() + ".";
  } else if (/(next|upcoming|first)/.test(q)) {
    t = s.nextPost ? 'Next up: "' + s.nextPost.title + '" on ' + fmtDate(s.nextPost.date) + "." : "Everything this month has gone out.";
  } else {
    t = p.person + "'s plan has " + s.total + " posts: " + s.counts.posted + " posted, " + s.counts.scheduled + " scheduled, " + s.needsClient + " waiting on approval.";
  }
  return t + "\\n\\n_Demo file: the live app answers with Claude._";
}
const realFetch = window.fetch.bind(window);
window.fetch = async (url, opts = {}) => {
  const m = String(url).match(/\\/api\\/plans\\/[^/?]+(\\/[^?]*)?/);
  if (!m) return realFetch(url, opts);
  const sub = m[1] || "", method = (opts.method || "GET").toUpperCase();
  const body = opts.body ? JSON.parse(opts.body) : {};
  for (const [k, fn] of Object.entries(routes)) {
    const [km, kp] = k.split(" ");
    if (km !== method) continue;
    const re = new RegExp("^" + kp.replace(/:[a-z]+/g, "([^/]+)") + "$");
    const hit = sub.match(re);
    if (hit) return fn(body, hit.slice(1));
  }
  return json({ error: "not in demo" }, 404);
};

// ---- demo controls: pick a plan, switch client/team, reset
document.addEventListener("DOMContentLoaded", () => {
  const bar = document.createElement("div");
  bar.className = "demo-bar";
  bar.innerHTML = '<b>DEMO FILE</b><select id="demoPlan">' + ids.map((i) => '<option value="' + i + '"' + (i === planId ? " selected" : "") + ">" + db.plans[i].client + " · " + db.plans[i].person + "</option>").join("") +
    '</select><div class="seg sm"><button data-as="client" class="' + (viewer === "client" ? "on" : "") + '">Client view</button><button data-as="team" class="' + (viewer === "team" ? "on" : "") + '">Team view</button></div>' +
    '<span class="demo-tip">Tip: open this file in a second tab with the other view to watch changes sync live.</span><button id="demoReset" class="btn sm">Reset demo</button>';
  document.body.prepend(bar);
  const go = (p, as) => { location.hash = "plan=" + p + "&as=" + as; location.reload(); };
  bar.querySelector("#demoPlan").onchange = (e) => go(e.target.value, viewer);
  bar.querySelectorAll("[data-as]").forEach((b) => (b.onclick = () => go(planId, b.dataset.as)));
  bar.querySelector("#demoReset").onclick = () => { try { localStorage.removeItem(KEY); } catch {} location.reload(); };
});
})();
`;

const css = read("public/app.css") + `
.demo-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 8px 24px; background: #fff1de; border-bottom: 1px solid #f6d8ae; font-size: 13px; }
.demo-bar b { color: #b36400; letter-spacing: .08em; font-size: 11.5px; }
.demo-bar select { border: 1px solid var(--line); border-radius: 8px; padding: 5px 8px; font: inherit; font-size: 13px; }
.demo-tip { color: var(--muted); font-size: 12px; flex: 1; }
.teambar a[href="/"] { display: none; }
`;

// In a file:// page the plan comes from the #plan= hash, not the URL path.
const planJs = read("public/plan.js").replace(
  'const planId = location.pathname.split("/").pop();',
  'const planId = new URLSearchParams(location.hash.slice(1)).get("plan") || "demo";',
);
if (!planJs.includes('location.hash.slice(1)).get("plan")')) throw new Error("plan.js planId line changed; update build-demo.mjs");

let html = read("public/plan.html")
  .replace('<link rel="stylesheet" href="/app.css">', () => `<style>${css}</style>`)
  .replace('src="/revboss-logo.png"', `src="${logo}"`)
  .replace("<title>Content Plan · RevBoss</title>", "<title>Content Plan Demo · RevBoss</title>")
  .replace('<script type="module" src="/plan.js"></script>', () => `<script>${shim}</script>\n<script type="module">${planJs}</script>`);

fs.mkdirSync(path.join(root, "dist"), { recursive: true });
const out = path.join(root, "dist", "content-plan-demo.html");
fs.writeFileSync(out, html);
console.log(`wrote ${path.relative(root, out)} (${Math.round(html.length / 1024)} KB, ${plans.length} plans)`);
process.exit(0);
