// Team dashboard: every client plan, its live state, and next month's generator.
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const COLORS = { posted: "#1c7a3e", scheduled: "#1545cd", approval_waiting: "#ff920a", approval_overdue: "#b03535", approval_not_sent: "#c3c9d9", todo: "#e2dccb" };
const LABELS = { posted: "posted", scheduled: "scheduled", approval_waiting: "waiting", approval_overdue: "overdue", approval_not_sent: "not sent", todo: "to write" };

let data = null;
let month = "";

function toast(text) {
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = `<b>●</b> ${esc(text)}`;
  $("#toasts").appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

const monthLabel = (m) => new Date(`${m}-01T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
function nextMonth(m) {
  const d = new Date(`${m}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 7);
}

async function load() {
  data = await (await fetch("/api/plans")).json();
  const months = [...new Set(data.plans.map((p) => p.month))].sort().reverse();
  month ||= months[0];
  $("#month").innerHTML = months.map((m) => `<option value="${m}" ${m === month ? "selected" : ""}>${monthLabel(m)}</option>`).join("");
  $("#mode").textContent = `${data.ordinal === "live" ? "Connected to Ordinal" : "Demo mode — Ordinal not connected (set ORDINAL_MCP_URL)"} · Chat: ${data.chat === "claude" ? "Claude" : "offline (set ANTHROPIC_API_KEY)"}`;
  render();
}

function render() {
  const plans = data.plans.filter((p) => p.month === month);
  const sum = (k) => plans.reduce((n, p) => n + (p.summary.counts[k] || 0), 0);
  const total = plans.reduce((n, p) => n + p.summary.total, 0);
  const fb = plans.reduce((n, p) => n + p.newFeedback, 0);
  $("#totals").innerHTML = `
    <div class="kpi"><div class="num">${plans.length}</div><div class="lbl">Plans</div></div>
    <div class="kpi"><div class="num">${total}</div><div class="lbl">Posts</div></div>
    <div class="kpi accent"><div class="num">${sum("scheduled") + sum("posted")}</div><div class="lbl">Approved or posted</div></div>
    <div class="kpi warn"><div class="num">${sum("approval_waiting")}</div><div class="lbl">Waiting on clients</div></div>
    <div class="kpi"><div class="num" style="color:var(--red)">${sum("approval_overdue")}</div><div class="lbl">Approval overdue</div></div>
    <div class="kpi"><div class="num">${fb}</div><div class="lbl">Open client feedback</div></div>`;

  const byClient = {};
  for (const p of plans) (byClient[p.client] ||= []).push(p);
  $("#groups").innerHTML = Object.entries(byClient).map(([client, rows]) => `
    <section class="client-group"><h2>${esc(client)}</h2><div class="plan-rows">
      ${rows.map(row).join("")}
    </div></section>`).join("") || '<p class="note">No plans for this month yet.</p>';

  document.querySelectorAll("[data-copy]").forEach((b) => (b.onclick = async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); toast("Client link copied"); } catch { prompt("Client link", b.dataset.copy); }
  }));
  document.querySelectorAll("[data-gen]").forEach((b) => (b.onclick = () => generate(b.dataset.gen)));
}

function row(p) {
  const s = p.summary;
  const order = ["posted", "scheduled", "approval_waiting", "approval_overdue", "approval_not_sent", "todo"];
  const bar = order.filter((k) => s.counts[k]).map((k) => `<i style="width:${(s.counts[k] / Math.max(s.total, 1)) * 100}%;background:${COLORS[k]}" title="${s.counts[k]} ${LABELS[k]}"></i>`).join("");
  const lbl = order.filter((k) => s.counts[k]).map((k) => `${s.counts[k]} ${LABELS[k]}`).join(" · ");
  const hasNext = data.plans.some((x) => x.client === p.client && x.person === p.person && x.month === nextMonth(p.month));
  return `<div class="plan-row">
    <div class="who"><b>${esc(p.person)}${p.draft ? ' <span class="badge-draft" style="vertical-align:1px">DRAFT</span>' : ""}</b><span>${esc(p.framework)} · ${s.total} posts</span></div>
    <div><div class="stack">${bar}</div><div class="stack-lbl">${esc(lbl || "no posts yet")}</div></div>
    <div>${p.newFeedback ? `<span class="dot-fb" title="Open client feedback">${p.newFeedback}</span>` : '<span class="note">—</span>'}</div>
    <div class="note">${p.lastSyncedAt ? `synced ${new Date(p.lastSyncedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : "not synced"}</div>
    <div class="actions">
      <a class="btn sm" href="/team/p/${p.id}">Open</a>
      <button class="btn sm" data-copy="${esc(p.shareUrl)}">Copy client link</button>
      ${hasNext ? "" : `<button class="btn sm primary" data-gen="${p.id}">Build ${esc(monthLabel(nextMonth(p.month)).split(" ")[0])}</button>`}
    </div>
  </div>`;
}

async function generate(fromPlanId) {
  const p = data.plans.find((x) => x.id === fromPlanId);
  const target = nextMonth(p.month);
  toast(`Building ${monthLabel(target)} for ${p.person} from Ordinal…`);
  const res = await fetch("/api/plans/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fromPlanId, month: target }),
  });
  const out = await res.json();
  if (!res.ok) return toast(out.error || "Could not build the plan");
  location.href = `/team/p/${out.plan.id}`;
}

$("#month").onchange = (e) => { month = e.target.value; render(); };
$("#syncAll").onclick = async () => {
  $("#syncAll").disabled = true;
  const plans = data.plans.filter((p) => p.month === month);
  let n = 0;
  for (const p of plans) {
    const r = await fetch(`/api/plans/${p.id}/sync`, { method: "POST", headers: { "x-viewer": "team" } });
    if (r.ok) n++;
  }
  $("#syncAll").disabled = false;
  toast(`Synced ${n} of ${plans.length} plans`);
  load();
};

load();
