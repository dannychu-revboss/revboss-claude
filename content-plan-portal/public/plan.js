// Client (and team) view of one live content plan.
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmtN = (n) => (n ?? 0).toLocaleString("en-US");
const fmtPct = (x) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);
const fmtDay = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const todayISO = () => new Date().toISOString().slice(0, 10);

const planId = location.pathname.split("/").pop();
const key = new URLSearchParams(location.search).get("k");
const isTeamPath = location.pathname.startsWith("/team/");

const state = { plan: null, viewer: "client", ordinal: "demo", chat: "offline", shareUrl: null, view: pref("view", "list"), board: pref("board", "status"), angle: "", status: "", account: "" };

// Remembered per viewer (view + board grouping); optional, so storage failures are ignored.
function pref(k, dflt) {
  try {
    return localStorage.getItem(`pref:${k}`) || dflt;
  } catch {
    return dflt;
  }
}
function setPref(k, v) {
  try {
    localStorage.setItem(`pref:${k}`, v);
  } catch {}
}
let history = loadHistory();

function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (key) headers["x-plan-key"] = key;
  if (isTeamPath) headers["x-viewer"] = "team";
  return fetch(`/api/plans/${planId}${path}`, { ...opts, headers });
}

// ---------------------------------------------------------------- loading
async function load() {
  const res = await api("");
  if (!res.ok) {
    $("#main").innerHTML = `<div class="card"><h2>This link isn't working</h2><p class="note">Ask your RevBoss contact for a fresh link to your content plan.</p></div>`;
    $("#side").classList.add("hidden");
    return;
  }
  const data = await res.json();
  Object.assign(state, { plan: data.plan, viewer: data.viewer, ordinal: data.ordinal, chat: data.chat, shareUrl: data.shareUrl || null });
  document.title = `${state.plan.person} · ${monthName(state.plan.month)} content plan · RevBoss`;
  if (state.viewer === "team") setupTeamBar();
  render();
  renderChatIntro();
  connectLive();
}

function monthName(m) {
  return new Date(`${m}-01T12:00:00Z`).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
}

// ---------------------------------------------------------------- live updates
function connectLive() {
  const qs = new URLSearchParams();
  if (key) qs.set("k", key);
  const es = new EventSource(`/api/plans/${planId}/stream?${qs}`);
  es.onopen = () => setLive(true);
  es.onerror = () => setLive(false);
  es.addEventListener("plan", (e) => {
    const { plan, change } = JSON.parse(e.data);
    const before = new Map(state.plan.posts.map((p) => [p.id, p.effectiveStatus]));
    state.plan = plan;
    render();
    const changed = plan.posts.filter((p) => before.get(p.id) !== p.effectiveStatus).map((p) => p.id);
    for (const id of changed) document.querySelectorAll(`[data-post="${id}"]`).forEach((el) => el.classList.add("flash"));
    if (change?.text) toast(change.text);
    if ($("#drawer").classList.contains("on")) openPost($("#drawer").dataset.post, true);
  });
}

function setLive(on) {
  const el = $("#live");
  el.classList.toggle("off", !on);
  const synced = state.plan?.lastSyncedAt ? ` · synced ${ago(state.plan.lastSyncedAt)}` : "";
  const src = state.ordinal === "live" ? "Live from Ordinal" : "Live · demo data";
  $("span", el).textContent = on ? `${src}${synced}` : "Reconnecting…";
}

function ago(iso) {
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
setInterval(() => state.plan && setLive(!$("#live").classList.contains("off")), 30000);

function toast(text) {
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = `<b>●</b> ${esc(text)}`;
  $("#toasts").appendChild(t);
  setTimeout(() => t.remove(), 4200);
}

// ---------------------------------------------------------------- render
function angleIndex(name) {
  const i = state.plan.angles.findIndex((a) => a.name === name);
  return i < 0 ? 2 : i % 5;
}
const chip = (name) => `<span class="chip a${angleIndex(name)}">${esc(name)}</span>`;
const pill = (p) => `<span class="pill s-${p.effectiveStatus}">${esc(statusText(p.effectiveStatus))}</span>`;
const STATUS_TEXT = { posted: "Posted", scheduled: "Scheduled", approval_waiting: "Approval waiting", approval_overdue: "Approval overdue", approval_not_sent: "Approval not yet sent", todo: "To write" };
const statusText = (s) => STATUS_TEXT[s] || s;

function render() {
  const p = state.plan;
  const s = p.summary;
  $("#framework").textContent = p.framework;
  setLive(!$("#live").classList.contains("off"));
  document.body.classList.toggle("team", state.viewer === "team");
  const editable = state.viewer === "team" ? 'contenteditable="true"' : "";

  $("#main").innerHTML = `
    <section class="plan-head">
      <div class="meta">${esc(p.client)} · ${esc(p.periodLabel)} · Prepared ${esc(p.preparedOn)}</div>
      <h1>${esc(p.person)} <span>/ ${esc(monthName(p.month))} content plan</span>${p.draft ? '<span class="badge-draft">DRAFT</span>' : ""}</h1>
      <p class="intro editable" data-field="intro" ${editable}>${esc(p.intro)}</p>
    </section>

    ${renderAsks(p)}

    <div class="kpis">
      <div class="kpi"><div class="num">${s.total}</div><div class="lbl">Posts this month</div></div>
      <div class="kpi"><div class="num">${s.counts.posted}</div><div class="lbl">Published</div></div>
      <div class="kpi accent"><div class="num">${s.counts.scheduled}</div><div class="lbl">Approved &amp; scheduled</div></div>
      <div class="kpi ${s.needsClient ? "warn" : ""}"><div class="num">${s.needsClient}</div><div class="lbl">Need your approval</div>${s.counts.approval_overdue ? `<div class="sub">${s.counts.approval_overdue} past its date</div>` : ""}</div>
      <div class="kpi"><div class="num">${fmtN(s.impressions)}</div><div class="lbl">Impressions so far</div><div class="sub">${s.measuredPosts ? `across ${s.measuredPosts} published post${s.measuredPosts > 1 ? "s" : ""}` : "updates as posts go out"}</div></div>
      <div class="kpi"><div class="num">${fmtPct(s.engagementRate)}</div><div class="lbl">Engagement rate</div><div class="sub">${fmtN(s.engagements)} reactions, comments, reposts</div></div>
    </div>
    ${state.ordinal !== "live" && s.measuredPosts ? `<div class="note" style="margin-top:6px">Metrics shown are demo sample numbers until Ordinal is connected.</div>` : ""}

    <section class="section">
      <div class="section-head">
        <div class="section-title">${esc(p.angleWord)} budget</div>
        <div class="legend"><span style="--c:#c9d3ee">Planned</span><span style="--c:var(--blue)">Published</span></div>
      </div>
      <div class="card angles">${s.angles.map((a) => renderAngle(a, Math.max(1, ...s.angles.map((x) => Math.max(x.target, x.planned))))).join("")}</div>
      <div class="note" style="margin-top:6px">These are our numbers, not yours yet. Move posts between ${esc(p.angleWord.toLowerCase())}s; the total is what holds.</div>
    </section>

    <section class="section">
      <div class="section-head">
        <div class="section-title">The plan</div>
        <div class="filters">
          ${p.accounts?.length ? `<select id="fAccount"><option value="">All accounts</option>${[p.person, ...p.accounts.filter((a) => a.toLowerCase() !== p.person.toLowerCase())].map((a) => `<option ${state.account === a ? "selected" : ""}>${esc(a)}</option>`).join("")}</select>` : ""}
          <select id="fAngle"><option value="">All ${esc(p.angleWord.toLowerCase())}s</option>${p.angles.map((a) => `<option ${state.angle === a.name ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select>
          <select id="fStatus"><option value="">Any status</option>${Object.entries(STATUS_TEXT).filter(([k]) => p.posts.some((x) => x.effectiveStatus === k)).map(([k, v]) => `<option value="${k}" ${state.status === k ? "selected" : ""}>${v}</option>`).join("")}</select>
          <div class="seg">${[["list", "List"], ["board", "Board"], ["calendar", "Calendar"]].map(([v, l]) => `<button data-view="${v}" class="${state.view === v ? "on" : ""}">${l}</button>`).join("")}</div>
        </div>
      </div>
      ${state.view === "board" ? renderBoard(p) : state.view === "calendar" ? renderCalendar(p) : renderList(p)}
      <div class="status-key">${esc(p.statusHelp)} Click any post for details, numbers and feedback.</div>
    </section>

    ${p.sections?.length ? `<section class="section"><div class="notes-grid">${p.sections.map((x) => `<div class="card"><div class="section-title">${esc(x.title)}</div><pre>${esc(x.body)}</pre></div>`).join("")}</div></section>` : ""}

    ${renderFeedback(p)}

    ${p.cta || p.bookingUrl ? `<section class="section"><div class="cta"><p>${esc(p.cta || "Book a session with Danny to plan next month.")}</p>${p.bookingUrl ? `<a class="btn primary" href="${esc(p.bookingUrl)}" target="_blank" rel="noopener">Book a session</a>` : ""}</div></section>` : ""}
    <div class="note" style="text-align:center;margin:28px 0 8px">RevBoss · Prepared for ${esc(p.person)}, ${esc(p.client)}</div>
  `;
  bindMain();
}

function renderAsks(p) {
  if (!p.waitingOn.length && state.viewer !== "team") return "";
  const editable = state.viewer === "team" ? 'contenteditable="true"' : "";
  return `<section class="asks">
    <div class="section-title">${esc(p.waitingLabel || "Waiting on you")}</div>
    ${p.waitingOn.map((w, i) => `<label class="ask ${w.done ? "done" : ""}">
        <input type="checkbox" data-ask="${i}" ${w.done ? "checked" : ""}>
        <span>${w.when ? `<span class="when">${esc(w.when)}</span> · ` : ""}<span class="editable" data-ask-text="${i}" ${editable}>${esc(w.ask)}</span></span>
      </label>`).join("") || '<div class="note">Nothing waiting on the client.</div>'}
    ${state.viewer === "team" ? '<button class="btn sm ghost" id="addAsk" style="margin-top:6px">+ Add an ask</button>' : ""}
  </section>`;
}

function renderAngle(a, max) {
  return `<div class="angle-row">
    <div><div class="angle-name">${chip(a.name)}</div>${a.why ? `<div class="angle-why">${esc(a.why)}</div>` : ""}</div>
    <div class="track" title="${a.planned} planned, ${a.published} published"><i style="width:${(a.planned / max) * 100}%"></i><u style="width:${(a.published / max) * 100}%"></u></div>
    <div class="angle-count"><b>${a.published}</b> / ${a.planned}${a.target !== a.planned ? ` <span class="note">(budget ${a.target})</span>` : ""}</div>
  </div>`;
}

function filtered(p) {
  return p.posts
    .filter((x) => !state.angle || x.angle === state.angle)
    .filter((x) => !state.status || x.effectiveStatus === state.status)
    .filter((x) => !state.account || (x.account || p.person).toLowerCase() === state.account.toLowerCase())
    .sort((a, b) => a.date.localeCompare(b.date) || (a.account || "").localeCompare(b.account || ""));
}

function renderList(p) {
  const rows = filtered(p);
  const today = todayISO();
  const multi = p.accounts?.length > 0;
  return `<div class="table-wrap"><table class="posts">
    <thead><tr><th>Date</th><th class="hide-xs">${esc(p.angleWord)}</th><th class="hide-sm">Topic tag</th><th>Post</th>${multi ? '<th class="hide-sm">Account</th>' : ""}<th class="hide-sm">Type</th><th>Status</th><th class="hide-sm" style="text-align:right">Reach</th></tr></thead>
    <tbody>${rows.map((x) => `<tr class="row ${x.date < today && x.effectiveStatus === "posted" ? "past" : ""}" data-post="${x.id}">
        <td style="white-space:nowrap">${esc(fmtDay(x.date))}</td>
        <td class="hide-xs">${chip(x.angle)}</td>
        <td class="tag hide-sm">${esc(x.topicTag)}</td>
        <td class="title">${esc(x.title)}</td>
        ${multi ? `<td class="hide-sm">${esc(x.account || p.person)}</td>` : ""}
        <td class="hide-sm">${esc(x.type)}</td>
        <td>${pill(x)}</td>
        <td class="metric hide-sm">${x.metrics ? `${fmtN(x.metrics.impressions)} <small>impr.</small>` : '<small>—</small>'}</td>
      </tr>`).join("") || `<tr><td colspan="8" class="note" style="padding:20px">No posts match these filters.</td></tr>`}</tbody>
  </table></div>`;
}

// Kanban: columns by status (where each post is in the approval flow) or by
// angle. Status comes from Ordinal, so status columns are read-only; on the
// team view, cards can be dragged between angle columns to re-file a post.
const STATUS_COLUMNS = [
  { key: "not_sent", title: "Not sent yet", statuses: ["todo", "approval_not_sent"], hint: "Written and on the calendar; the approval request goes out ahead of its date." },
  { key: "waiting", title: "Waiting on you", statuses: ["approval_overdue", "approval_waiting"], hint: "Needs your OK in Ordinal before its date." },
  { key: "scheduled", title: "Scheduled", statuses: ["scheduled"], hint: "Approved and queued." },
  { key: "posted", title: "Posted", statuses: ["posted"], hint: "Live on LinkedIn." },
];

function renderBoard(p) {
  const rows = filtered(p);
  const byAngle = state.board === "angle";
  const canDrag = byAngle && state.viewer === "team";
  let cols;
  if (byAngle) {
    const names = [...p.angles.map((a) => a.name), ...new Set(rows.map((x) => x.angle).filter((n) => !p.angles.some((a) => a.name === n)))];
    cols = names.map((name) => {
      const a = p.summary.angles.find((x) => x.name === name);
      return { key: name, title: name, items: rows.filter((x) => x.angle === name), meta: a ? `${a.planned} planned · budget ${a.target}` : "", hint: a?.why || "" };
    });
  } else {
    cols = STATUS_COLUMNS.map((c) => ({ ...c, items: rows.filter((x) => c.statuses.includes(x.effectiveStatus)), meta: "" }))
      // "Not sent yet" only matters when something is in it; the other three always show.
      .filter((c) => c.key !== "not_sent" || c.items.length);
  }
  const today = todayISO();
  return `
    <div class="board-bar">
      <span class="note">Group by</span>
      <div class="seg sm">${[["status", "Status"], ["angle", esc(p.angleWord)]].map(([v, l]) => `<button data-board="${v}" class="${state.board === v ? "on" : ""}">${l}</button>`).join("")}</div>
      ${canDrag ? `<span class="note">Drag a card to move it to another ${esc(p.angleWord.toLowerCase())}.</span>` : ""}
    </div>
    <div class="board" style="--cols:${cols.length}">
      ${cols.map((c) => `<div class="col ${byAngle ? "" : `col-${c.key}`}" data-col="${esc(c.key)}">
        <div class="col-head">
          <div>${byAngle ? chip(c.title) : `<b>${esc(c.title)}</b>`}<span class="count">${c.items.length}</span></div>
          ${c.meta ? `<div class="note">${esc(c.meta)}</div>` : ""}
          ${c.hint ? `<div class="col-hint">${esc(c.hint)}</div>` : ""}
        </div>
        <div class="col-body">
          ${c.items.map((x) => card(x, { byAngle, canDrag, today, p })).join("") || '<div class="col-empty">Nothing here</div>'}
        </div>
      </div>`).join("")}
    </div>`;
}

function card(x, { byAngle, canDrag, today, p }) {
  const m = x.metrics;
  const waiting = x.effectiveStatus === "approval_waiting" || x.effectiveStatus === "approval_overdue";
  return `<article class="kcard ${x.effectiveStatus === "approval_overdue" ? "overdue" : ""}" data-post="${x.id}" ${canDrag ? 'draggable="true"' : ""} tabindex="0">
    <div class="kc-top"><span class="kc-date ${x.date === today ? "is-today" : ""}">${esc(fmtDay(x.date))}</span>${byAngle ? pill(x) : chip(x.angle)}</div>
    <div class="kc-title">${esc(x.title)}</div>
    <div class="kc-meta">${esc(x.type)}${x.topicTag ? ` · ${esc(x.topicTag)}` : ""}${x.account && x.account.toLowerCase() !== p.person.toLowerCase() ? ` · ${esc(x.account)}` : ""}</div>
    ${m ? `<div class="kc-metrics"><span><b>${fmtN(m.impressions)}</b> impr.</span><span><b>${fmtN((m.reactions || 0) + (m.comments || 0) + (m.reposts || 0))}</b> eng.</span><span><b>${fmtPct(m.engagementRate)}</b></span></div>` : ""}
    ${waiting && x.ordinalUrl ? `<a class="kc-cta" href="${esc(x.ordinalUrl)}" target="_blank" rel="noopener" data-stop>${x.effectiveStatus === "approval_overdue" ? "Past its date · " : ""}Approve in Ordinal ↗</a>` : ""}
  </article>`;
}

function bindBoard() {
  document.querySelectorAll("[data-board]").forEach((b) => b.addEventListener("click", () => { state.board = b.dataset.board; setPref("board", state.board); render(); }));
  document.querySelectorAll(".kcard [data-stop]").forEach((a) => a.addEventListener("click", (e) => e.stopPropagation()));
  document.querySelectorAll(".kcard").forEach((c) => c.addEventListener("keydown", (e) => e.key === "Enter" && openPost(c.dataset.post)));
  if (!(state.board === "angle" && state.viewer === "team")) return;
  let dragId = null;
  document.querySelectorAll(".kcard[draggable]").forEach((c) => {
    c.addEventListener("dragstart", (e) => { dragId = c.dataset.post; c.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; });
    c.addEventListener("dragend", () => { c.classList.remove("dragging"); document.querySelectorAll(".col.drop").forEach((x) => x.classList.remove("drop")); });
  });
  document.querySelectorAll(".col").forEach((col) => {
    col.addEventListener("dragover", (e) => { if (dragId) { e.preventDefault(); col.classList.add("drop"); } });
    col.addEventListener("dragleave", () => col.classList.remove("drop"));
    col.addEventListener("drop", async (e) => {
      e.preventDefault();
      col.classList.remove("drop");
      const post = state.plan.posts.find((x) => x.id === dragId);
      const angle = col.dataset.col;
      dragId = null;
      if (!post || post.angle === angle) return;
      post.angle = angle; // optimistic; the server's change event re-renders with the saved plan
      render();
      const res = await api(`/posts/${post.id}`, { method: "PATCH", body: JSON.stringify({ angle }) });
      if (!res.ok) { toast("Couldn't move that post"); load(); }
    });
  });
}

function renderCalendar(p) {
  const rows = filtered(p);
  const [y, m] = p.month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const start = new Date(first);
  start.setUTCDate(1 - ((first.getUTCDay() + 6) % 7)); // Monday-start weeks
  const today = todayISO();
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    if (i >= 35 && d.getUTCMonth() !== m - 1) break;
    const evs = rows.filter((x) => x.date === iso);
    const out = d.getUTCMonth() !== m - 1;
    cells.push(`<div class="day ${out ? "out" : ""} ${iso === today ? "today" : ""} ${evs.length ? "" : "empty"}">
      <div class="dnum">${d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })} ${d.getUTCDate()}</div>
      ${evs.map((x) => `<div class="ev s-${x.effectiveStatus}" data-post="${x.id}" title="${esc(statusText(x.effectiveStatus))}"><b>${esc(x.title)}</b>${esc(x.angle)} · ${esc(statusText(x.effectiveStatus))}${x.account ? ` · ${esc(x.account)}` : ""}</div>`).join("")}
    </div>`);
  }
  return `<div class="cal">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => `<div class="dow">${d}</div>`).join("")}${cells.join("")}</div>`;
}

function renderFeedback(p) {
  if (!p.feedback?.length) return "";
  const items = p.feedback.slice(0, state.viewer === "team" ? 30 : 6);
  return `<section class="section"><div class="section-head"><div class="section-title">Feedback &amp; requests</div><span class="note">Shared with the RevBoss team</span></div>
    <div class="card">${items.map((f) => `<div class="fb">${esc(f.message)}<small>${esc(f.author)} · ${new Date(f.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}${f.postTitle ? ` · on "${esc(f.postTitle)}"` : " · on the plan"}${f.sentToOrdinal ? " · added to Ordinal" : ""}${f.resolved ? " · resolved" : ""}${state.viewer === "team" && !f.resolved ? ` · <a href="#" data-resolve="${f.id}">Mark resolved</a>` : ""}</small></div>`).join("")}</div></section>`;
}

function bindMain() {
  document.querySelectorAll("[data-post]").forEach((el) => el.addEventListener("click", () => openPost(el.dataset.post)));
  document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => { state.view = b.dataset.view; setPref("view", state.view); render(); }));
  if (state.view === "board") bindBoard();
  $("#fAngle")?.addEventListener("change", (e) => { state.angle = e.target.value; render(); });
  $("#fStatus")?.addEventListener("change", (e) => { state.status = e.target.value; render(); });
  $("#fAccount")?.addEventListener("change", (e) => { state.account = e.target.value; render(); });
  document.querySelectorAll("[data-ask]").forEach((cb) =>
    cb.addEventListener("change", async () => {
      await api(`/asks/${cb.dataset.ask}`, { method: "POST", body: JSON.stringify({ done: cb.checked }) });
    }),
  );
  document.querySelectorAll("[data-resolve]").forEach((a) =>
    a.addEventListener("click", async (e) => {
      e.preventDefault();
      await api(`/feedback/${a.dataset.resolve}/resolve`, { method: "POST" });
      load();
    }),
  );
  if (state.viewer === "team") bindTeamEdits();
}

// ---------------------------------------------------------------- post drawer
function openPost(id, refresh = false) {
  const p = state.plan;
  const x = p.posts.find((y) => y.id === id);
  if (!x) return;
  const d = $("#drawer");
  d.dataset.post = id;
  const m = x.metrics;
  const fb = p.feedback.filter((f) => f.postId === id);
  const draft = refresh ? $("#fbText")?.value || "" : "";
  const needsOk = x.effectiveStatus === "approval_waiting" || x.effectiveStatus === "approval_overdue";
  d.innerHTML = `
    <div class="d-head">
      <button class="x" id="dClose" aria-label="Close">×</button>
      <div>${chip(x.angle)} ${pill(x)}</div>
      <h2>${esc(x.title)}</h2>
      <div class="note">${esc(fmtDay(x.date))}${x.account ? ` · ${esc(x.account)}` : ""} · ${esc(x.type)}${x.channels?.length ? ` · ${esc(x.channels.join(" · "))}` : ""}</div>
    </div>
    <div class="d-body">
      <dl class="facts">
        <dt>Topic tag</dt><dd>${esc(x.topicTag || "—")}</dd>
        <dt>${esc(p.angleWord)}</dt><dd>${esc(x.angle)}${angleDesc(x.angle)}</dd>
        <dt>Status</dt><dd>${esc(statusExplain(x.effectiveStatus))}</dd>
      </dl>
      ${needsOk && x.ordinalUrl ? `<p style="margin:16px 0 0"><a class="btn blue" href="${esc(x.ordinalUrl)}" target="_blank" rel="noopener">Review &amp; approve in Ordinal ↗</a></p>` : x.ordinalUrl ? `<p style="margin:16px 0 0"><a class="btn" href="${esc(x.ordinalUrl)}" target="_blank" rel="noopener">Open in Ordinal ↗</a></p>` : ""}

      ${m ? `<div class="section-title" style="margin-top:22px">How it's doing${m.demo ? ' <span class="note">(demo numbers)</span>' : ""}</div>
        <div class="mgrid">
          <div><b>${fmtN(m.impressions)}</b><span>Impressions</span></div>
          <div><b>${fmtN(m.reactions)}</b><span>Reactions</span></div>
          <div><b>${fmtN(m.comments)}</b><span>Comments</span></div>
          <div><b>${fmtN(m.reposts)}</b><span>Reposts</span></div>
          <div><b>${fmtN(m.profileViews)}</b><span>Profile views</span></div>
          <div><b>${fmtPct(m.engagementRate)}</b><span>Engagement</span></div>
        </div>
        ${m.linkedInUrl ? `<p class="note" style="margin-top:8px"><a href="${esc(m.linkedInUrl)}" target="_blank" rel="noopener">View on LinkedIn ↗</a></p>` : ""}` : x.effectiveStatus === "posted" ? '<p class="note" style="margin-top:18px">Numbers appear here within a few hours of posting.</p>' : ""}

      ${x.copy ? `<div class="section-title" style="margin-top:22px">Post copy</div><div class="copy">${esc(x.copy)}</div>` : ""}

      <div class="section-title" style="margin-top:22px">Feedback for the team</div>
      ${fb.map((f) => `<div class="fb">${esc(f.message)}<small>${esc(f.author)} · ${new Date(f.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}${f.sentToOrdinal ? " · added to Ordinal" : ""}</small></div>`).join("")}
      <form id="fbForm" style="margin-top:10px">
        <textarea id="fbText" placeholder="Want a change? Say what, and we'll take it from there.">${esc(draft)}</textarea>
        <div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="btn primary" type="submit">Send to RevBoss</button></div>
      </form>
    </div>`;
  d.classList.add("on");
  d.setAttribute("aria-hidden", "false");
  $("#scrim").classList.add("on");
  $("#dClose").onclick = closeDrawer;
  $("#fbForm").onsubmit = async (e) => {
    e.preventDefault();
    const message = $("#fbText").value.trim();
    if (!message) return;
    $("#fbText").value = "";
    await api("/feedback", { method: "POST", body: JSON.stringify({ postId: id, message }) });
  };
}

function angleDesc(name) {
  const a = state.plan.angles.find((y) => y.name === name);
  return a?.description ? `<div class="note">${esc(a.description)}</div>` : "";
}

function statusExplain(s) {
  return {
    posted: "Live on LinkedIn.",
    scheduled: "Approved and queued in Ordinal.",
    approval_waiting: "Waiting on your OK in Ordinal before its date.",
    approval_overdue: "Its date has passed and it still needs your OK. Approve it in Ordinal or tell us to move it.",
    approval_not_sent: "Written and on the calendar. The approval request goes out ahead of its date.",
    todo: "On the calendar; still being written.",
  }[s] || s;
}

function closeDrawer() {
  $("#drawer").classList.remove("on");
  $("#drawer").setAttribute("aria-hidden", "true");
  $("#scrim").classList.remove("on");
}
$("#scrim").onclick = closeDrawer;
document.addEventListener("keydown", (e) => e.key === "Escape" && closeDrawer());

// ---------------------------------------------------------------- chat
function loadHistory() {
  try {
    return JSON.parse(sessionStorage.getItem(`chat:${planId}`) || "[]");
  } catch {
    return [];
  }
}
function saveHistory() {
  try {
    sessionStorage.setItem(`chat:${planId}`, JSON.stringify(history.slice(-30)));
  } catch {}
}

function mdLite(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/(^|[\s(])_(.+?)_(?=[\s).,]|$)/g, "$1<em>$2</em>")
    .replace(/(https?:\/\/[^\s<)]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}

function addMsg(role, text, cls = "") {
  const el = document.createElement("div");
  el.className = `msg ${role === "user" ? "user" : "bot"} ${cls}`;
  el.innerHTML = role === "user" ? esc(text) : mdLite(text);
  $("#msgs").appendChild(el);
  $("#msgs").scrollTop = $("#msgs").scrollHeight;
  return el;
}

const TOOL_TEXT = {
  get_plan_overview: "Reading your plan…",
  list_posts: "Looking through the posts…",
  get_post: "Checking that post in Ordinal…",
  get_performance: "Pulling LinkedIn numbers…",
  leave_feedback: "Passing that to the team…",
  complete_ask: "Updating your checklist…",
};

function renderChatIntro() {
  const p = state.plan;
  $("#chatMode").textContent = state.chat === "claude" ? "Answers come from your live plan and Ordinal." : "Offline mode — basic answers only.";
  $("#msgs").innerHTML = "";
  if (!history.length) {
    const first = p.person.split(" ")[0];
    addMsg("assistant", state.viewer === "team"
      ? `Team view for ${p.person}. Ask what's blocked, what's overdue, or how the month is tracking.`
      : `Hi ${first}. Ask me anything about your ${monthName(p.month)} plan: what needs your OK, how published posts are doing, or a change you'd like. I'll pass changes straight to the team.`);
  } else {
    for (const m of history) addMsg(m.role, m.content);
  }
  const s = p.summary;
  const prompts = [
    s.needsClient ? "What's waiting on me?" : "What's coming up next?",
    s.counts.posted ? "How are my posts doing?" : "When does the first post go out?",
    `Which ${p.angleWord.toLowerCase()} has the most posts?`,
    "I'd like to change a post",
  ];
  $("#suggest").innerHTML = prompts.map((q) => `<button type="button">${esc(q)}</button>`).join("");
  $("#suggest").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => send(b.textContent)));
}

let busy = false;
async function send(text) {
  text = text.trim();
  if (!text || busy) return;
  busy = true;
  $("#send").disabled = true;
  $("#input").value = "";
  addMsg("user", text);
  const bubble = addMsg("assistant", "", "typing");
  let out = "";
  let toolNote = "";
  try {
    const res = await api("/chat", { method: "POST", body: JSON.stringify({ message: text, history }) });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const line = buf.slice(0, i).replace(/^data: /, "");
        buf = buf.slice(i + 2);
        if (!line.trim()) continue;
        const ev = JSON.parse(line);
        if (ev.type === "text") out += ev.text;
        if (ev.type === "tool") toolNote = TOOL_TEXT[ev.name] || "Working…";
        if (ev.type === "error") throw new Error(ev.message);
        bubble.innerHTML = (toolNote && !out ? `<span class="tool">${esc(toolNote)}</span>` : "") + mdLite(out);
        $("#msgs").scrollTop = $("#msgs").scrollHeight;
      }
    }
    bubble.classList.remove("typing");
    history.push({ role: "user", content: text }, { role: "assistant", content: out });
    saveHistory();
  } catch (err) {
    bubble.classList.remove("typing");
    bubble.classList.add("err");
    bubble.textContent = err.message || "Something went wrong.";
  } finally {
    busy = false;
    $("#send").disabled = false;
  }
}

$("#composer").addEventListener("submit", (e) => { e.preventDefault(); send($("#input").value); });
$("#input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send($("#input").value); }
});
$("#chatFab").onclick = () => $("#side").classList.add("open");
$("#chatClose").onclick = () => $("#side").classList.remove("open");

// ---------------------------------------------------------------- team tools
function setupTeamBar() {
  $("#teambar").classList.remove("hidden");
  $("#tbStatus").textContent = `${state.ordinal === "live" ? "Ordinal connected" : "Demo data"} · chat ${state.chat === "claude" ? "on" : "offline"}`;
  if (state.ordinal !== "live") $("#tbSimulate").classList.remove("hidden");
  $("#tbPublish").classList.toggle("hidden", !state.plan.draft);
  $("#tbSync").onclick = async () => {
    $("#tbSync").disabled = true;
    const r = await (await api("/sync", { method: "POST" })).json();
    $("#tbSync").disabled = false;
    toast(r.errors?.length ? `Sync finished with ${r.errors.length} error(s)` : `Synced ${r.checked} posts`);
  };
  $("#tbSimulate").onclick = () => api("/demo/approve-next", { method: "POST" });
  $("#tbCopy").onclick = async () => {
    try {
      await navigator.clipboard.writeText(state.shareUrl);
      toast("Client link copied");
    } catch {
      prompt("Client link", state.shareUrl);
    }
  };
  $("#tbPublish").onclick = async () => {
    await api("", { method: "PATCH", body: JSON.stringify({ draft: false }) });
    state.plan.draft = false;
    $("#tbPublish").classList.add("hidden");
  };
}

function bindTeamEdits() {
  const intro = document.querySelector('[data-field="intro"]');
  intro?.addEventListener("blur", () => {
    if (intro.textContent.trim() !== state.plan.intro) patchPlan({ intro: intro.textContent.trim() });
  });
  document.querySelectorAll("[data-ask-text]").forEach((el) => {
    el.addEventListener("click", (e) => e.preventDefault());
    el.addEventListener("blur", () => {
      const i = Number(el.dataset.askText);
      const text = el.textContent.trim();
      const asks = state.plan.waitingOn.map((w) => ({ ...w }));
      if (!text) asks.splice(i, 1);
      else if (text !== asks[i].ask) asks[i].ask = text;
      else return;
      patchPlan({ waitingOn: asks });
    });
  });
  $("#addAsk")?.addEventListener("click", () => {
    const ask = prompt("What do you need from the client?");
    if (!ask) return;
    const when = prompt("When? (e.g. Tue Oct 13 — optional)") || "";
    patchPlan({ waitingOn: [...state.plan.waitingOn, { when, ask, done: false }] });
  });
}

async function patchPlan(body) {
  await api("", { method: "PATCH", body: JSON.stringify(body) });
}

load();
