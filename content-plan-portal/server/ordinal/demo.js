// Demo adapter: runs the whole app with no Ordinal credentials. Post data comes
// from the imported plans; metrics are deterministic sample numbers, labelled as
// demo data in the UI. Same interface as live.js.
import crypto from "node:crypto";
import { listPlans } from "../store.js";

function rand(seed, min, max) {
  const h = crypto.createHash("sha1").update(seed).digest();
  return min + (h.readUInt32BE(0) % (max - min + 1));
}

const TO_ORDINAL = {
  posted: "Posted",
  scheduled: "Scheduled",
  approval_waiting: "ForReview",
  approval_overdue: "ForReview",
  approval_not_sent: "ToDo",
  todo: "ToDo",
};

function allPosts() {
  return listPlans().flatMap((plan) =>
    plan.posts.map((p) => ({ plan, p })),
  );
}

function toPost({ plan, p }) {
  return {
    ordinalPostId: p.ordinalPostId,
    url: p.ordinalUrl,
    title: p.title,
    ordinalStatus: TO_ORDINAL[p.status] || "ToDo",
    publishAt: p.date ? `${p.date}T14:30:00.000Z` : null,
    date: p.date,
    channels: ["LinkedIn"],
    labels: [`Pillar: ${p.angle}`, plan.person.split(" ")[0]],
    profileId: `demo-${plan.id}`,
    profileName: p.account || plan.person,
    copy: "",
    assetCount: p.type === "Text" ? 0 : 1,
    comments: [],
  };
}

const comments = [];

export const demo = {
  name: "demo",
  live: false,

  async getPost(workspace, postId) {
    const hit = allPosts().find(({ p }) => p.ordinalPostId === postId);
    if (!hit) throw new Error(`post ${postId} not found`);
    return toPost(hit);
  },

  async listApprovals(workspace, postId) {
    const hit = allPosts().find(({ p }) => p.ordinalPostId === postId);
    if (!hit) return [];
    const s = hit.p.status;
    if (s === "approval_waiting" || s === "approval_overdue") return [{ status: "Requested", user: hit.plan.person, dueDate: null }];
    if (s === "scheduled" || s === "posted") return [{ status: "Approved", user: hit.plan.person, dueDate: null }];
    return [];
  },

  async listPosts(workspace, { from, to }) {
    return allPosts()
      .filter(({ plan, p }) => plan.ordinalWorkspace === workspace && p.date >= from && p.date <= to)
      .map(toPost);
  },

  async getLabels(workspace) {
    const names = new Set();
    for (const { plan, p } of allPosts()) {
      if (plan.ordinalWorkspace !== workspace) continue;
      names.add(`Pillar: ${p.angle}`);
      names.add(plan.person.split(" ")[0]);
    }
    return [...names].map((name) => ({ id: name, name }));
  },

  // Sample LinkedIn numbers for posts that have gone out. Older posts have more
  // reach, so the numbers move as days pass — enough to demo the live view.
  async getPostMetrics(workspace, profileId) {
    const planId = profileId.replace(/^demo-/, "");
    const plan = listPlans().find((x) => x.id === planId);
    const out = {};
    if (!plan) return out;
    const today = new Date().toISOString().slice(0, 10);
    for (const p of plan.posts) {
      if (p.status !== "posted" || !p.ordinalPostId || p.date > today) continue;
      const ageDays = Math.max(1, Math.round((Date.parse(today) - Date.parse(p.date)) / 864e5) + 1);
      const base = rand(p.ordinalPostId, 120, 900);
      const impressions = Math.round(base * Math.min(1, 0.35 + ageDays * 0.13));
      const reactions = Math.round(impressions * rand(`${p.ordinalPostId}r`, 12, 45) / 1000);
      const commentsN = Math.round(reactions * rand(`${p.ordinalPostId}c`, 5, 30) / 100);
      const reposts = rand(`${p.ordinalPostId}s`, 0, 3);
      out[p.ordinalPostId] = {
        impressions, reactions, comments: commentsN, reposts,
        saves: rand(`${p.ordinalPostId}v`, 0, 4), sends: rand(`${p.ordinalPostId}d`, 0, 3),
        profileViews: rand(`${p.ordinalPostId}p`, 0, 9), followersGained: rand(`${p.ordinalPostId}f`, 0, 4),
        engagementRate: impressions ? (reactions + commentsN + reposts) / impressions : null,
        linkedInUrl: null, publishedAt: `${p.date}T14:30:00.000Z`, demo: true,
      };
    }
    return out;
  },

  async addComment(workspace, postId, message) {
    comments.push({ workspace, postId, message, at: new Date().toISOString() });
    return { ok: true, demo: true };
  },
};
