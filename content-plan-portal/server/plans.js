// Shared plan logic used by the API, the chat tools and the generator.

export const STATUSES = {
  posted: { label: "Posted", rank: 0 },
  scheduled: { label: "Scheduled", rank: 1 },
  approval_waiting: { label: "Approval waiting", rank: 2 },
  approval_overdue: { label: "Approval overdue", rank: 3 },
  approval_not_sent: { label: "Approval not yet sent", rank: 4 },
  todo: { label: "To write", rank: 5 },
};

export const STATUS_HELP =
  "Posted is live. Scheduled is approved and queued. Approval waiting is with you in Ordinal and needs your OK before its date. " +
  "Approval overdue has passed its date without an OK. Approval not yet sent is written and on the calendar; the request goes out ahead of its date.";

export const FRAMEWORKS = {
  "The Four Angles": ["Playbook", "Proof", "Stance", "Human"],
  "The Five Pillars": ["Thought Leadership", "Playbook", "Influencers", "FOMO", "Product Marketing"],
};

export function statusLabel(s) {
  return STATUSES[s]?.label || s;
}

// An approval that is still pending on or after its publish date is overdue.
export function effectiveStatus(post, today = todayISO()) {
  if (post.status === "approval_waiting" && post.date && post.date < today) {
    return "approval_overdue";
  }
  return post.status;
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function summarize(plan, today = todayISO()) {
  const counts = Object.fromEntries(Object.keys(STATUSES).map((k) => [k, 0]));
  let impressions = 0;
  let engagements = 0;
  let measured = 0;
  for (const p of plan.posts) {
    counts[effectiveStatus(p, today)] = (counts[effectiveStatus(p, today)] || 0) + 1;
    if (p.metrics) {
      measured++;
      impressions += p.metrics.impressions || 0;
      engagements += (p.metrics.reactions || 0) + (p.metrics.comments || 0) + (p.metrics.reposts || 0);
    }
  }
  const angles = plan.angles.map((a) => {
    const posts = plan.posts.filter((p) => p.angle === a.name);
    return {
      ...a,
      planned: posts.length,
      published: posts.filter((p) => p.status === "posted").length,
    };
  });
  const next = plan.posts
    .filter((p) => p.date >= today && p.status !== "posted")
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  return {
    total: plan.posts.length,
    counts,
    needsClient: counts.approval_waiting + counts.approval_overdue,
    openAsks: plan.waitingOn.filter((w) => !w.done).length,
    impressions,
    engagements,
    engagementRate: impressions ? engagements / impressions : null,
    measuredPosts: measured,
    angles,
    nextPost: next ? { id: next.id, date: next.date, title: next.title } : null,
  };
}

// The client-safe view of a plan: everything except internal fields.
export function publicPlan(plan) {
  const { shareToken, ...rest } = plan;
  return {
    ...rest,
    posts: plan.posts.map((p) => ({ ...p, effectiveStatus: effectiveStatus(p) })),
    summary: summarize(plan),
    statusHelp: STATUS_HELP,
  };
}

export function findPost(plan, ref) {
  if (!ref) return null;
  const r = String(ref).toLowerCase();
  return (
    plan.posts.find((p) => p.id === ref || p.ordinalPostId === ref) ||
    plan.posts.find((p) => p.title.toLowerCase() === r) ||
    plan.posts.find((p) => p.title.toLowerCase().includes(r)) ||
    null
  );
}

export function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}
