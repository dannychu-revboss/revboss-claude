// Keeps plans in step with Ordinal: post status (incl. approvals), title, date,
// and LinkedIn metrics. Runs on a timer and on demand ("Sync now").
import { ordinal, planStatus } from "./ordinal/index.js";
import { getPlan, listPlans, updatePlan } from "./store.js";
import { statusLabel } from "./plans.js";

const running = new Map();

async function mapLimit(items, limit, fn) {
  const out = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        out[idx] = await fn(items[idx]);
      } catch (err) {
        out[idx] = { error: err.message };
      }
    }
  });
  await Promise.all(workers);
  return out;
}

function monthRange(plan) {
  const dates = plan.posts.map((p) => p.date).filter(Boolean).sort();
  const from = dates[0] || `${plan.month}-01`;
  const end = new Date(`${plan.month}-01T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(end.getUTCDate() + 14); // keep collecting reach two weeks past month end
  return { from, to: end.toISOString().slice(0, 10) };
}

export function syncPlan(planId) {
  if (running.has(planId)) return running.get(planId);
  const job = doSync(planId).finally(() => running.delete(planId));
  running.set(planId, job);
  return job;
}

async function doSync(planId) {
  const plan = getPlan(planId);
  if (!plan) throw Object.assign(new Error("plan not found"), { status: 404 });
  const ws = plan.ordinalWorkspace;
  const linked = plan.posts.filter((p) => p.ordinalPostId);
  const report = { planId, adapter: ordinal.name, checked: linked.length, statusChanges: [], errors: [] };

  // 1. Post status + details (live only: in demo mode the plan itself is the source).
  let remote = [];
  if (ordinal.live && ws) {
    remote = await mapLimit(linked, 4, async (p) => {
      const post = await ordinal.getPost(ws, p.ordinalPostId);
      const approvals = post.ordinalStatus === "Posted" ? [] : await ordinal.listApprovals(ws, p.ordinalPostId);
      return { id: p.id, post, status: planStatus(post.ordinalStatus, approvals) };
    });
  }

  // 2. Metrics, per LinkedIn profile.
  const profiles = new Set();
  for (const r of remote) if (r?.post?.profileId) profiles.add(r.post.profileId);
  if (!ordinal.live) profiles.add(`demo-${plan.id}`);
  for (const p of plan.posts) if (p.profileId) profiles.add(p.profileId);
  const range = monthRange(plan);
  const metrics = {};
  for (const prof of profiles) {
    try {
      Object.assign(metrics, await ordinal.getPostMetrics(ws, prof, range));
    } catch (err) {
      report.errors.push(`metrics ${prof}: ${err.message}`);
    }
  }

  updatePlan(planId, (pl) => {
    let changed = false;
    for (const r of remote) {
      if (!r || r.error) {
        if (r?.error) report.errors.push(r.error);
        continue;
      }
      const p = pl.posts.find((x) => x.id === r.id);
      if (r.status !== p.status) {
        report.statusChanges.push({ post: p.title, from: statusLabel(p.status), to: statusLabel(r.status) });
        p.status = r.status;
        p.statusLabel = statusLabel(r.status);
        changed = true;
      }
      if (r.post.date && r.post.date !== p.date) {
        p.date = r.post.date;
        changed = true;
      }
      if (r.post.title && r.post.title !== p.title) {
        p.title = r.post.title;
        changed = true;
      }
      p.profileId = r.post.profileId || p.profileId;
      p.copy = r.post.copy || p.copy;
    }
    for (const p of pl.posts) {
      const m = p.ordinalPostId && metrics[p.ordinalPostId];
      if (m && JSON.stringify(m) !== JSON.stringify(p.metrics)) {
        p.metrics = m;
        changed = true;
      }
    }
    pl.lastSyncedAt = new Date().toISOString();
    pl.lastSyncAdapter = ordinal.name;
    if (!changed) return { kind: "sync", silent: true, text: "Synced with Ordinal — no changes" };
    const n = report.statusChanges.length;
    return {
      kind: "sync",
      text: n ? `Synced with Ordinal — ${n} status change${n > 1 ? "s" : ""}` : "Synced with Ordinal — metrics updated",
      details: report.statusChanges,
    };
  });
  return report;
}

export function startScheduler() {
  const minutes = Number(process.env.SYNC_INTERVAL_MIN || (ordinal.live ? 15 : 5));
  if (!minutes) return;
  const tick = async () => {
    for (const plan of listPlans()) {
      try {
        await syncPlan(plan.id);
      } catch (err) {
        console.error(`[sync] ${plan.id}: ${err.message}`);
      }
    }
  };
  setTimeout(tick, 2000);
  setInterval(tick, minutes * 60 * 1000).unref();
}
