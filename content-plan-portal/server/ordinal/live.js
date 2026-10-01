// Live Ordinal adapter. Talks to Ordinal through its MCP server — the same tools
// RevBoss already uses from Claude (ordinal_search_content, ordinal_get_analytics,
// ordinal_list_approvals, ordinal_manage_comments). If Ordinal exposes a REST API
// for your account, re-implement these five methods against it; nothing else in
// the app needs to change.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

let clientPromise = null;

async function connect() {
  const url = process.env.ORDINAL_MCP_URL;
  if (!url) throw new Error("ORDINAL_MCP_URL is not set");
  const headers = {};
  if (process.env.ORDINAL_API_KEY) headers.Authorization = `Bearer ${process.env.ORDINAL_API_KEY}`;
  const client = new Client({ name: "revboss-content-plan-portal", version: "0.1.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } }));
  return client;
}

async function call(name, args) {
  clientPromise ||= connect().catch((err) => {
    clientPromise = null;
    throw err;
  });
  const client = await clientPromise;
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
  if (res.isError) throw new Error(`Ordinal ${name} failed: ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Ordinal ${name} returned non-JSON: ${text.slice(0, 200)}`);
  }
}

function toPost(p) {
  const li = p.linkedIn || {};
  return {
    ordinalPostId: p.id,
    url: p.url,
    title: p.title,
    ordinalStatus: p.status,
    publishAt: p.publishAt || null,
    date: p.publishDate || (p.publishAt ? p.publishAt.slice(0, 10) : null),
    channels: p.channels || [],
    labels: (p.labels || []).map((l) => l.name),
    profileId: li.profile?.id || null,
    profileName: li.profile?.name || null,
    copy: li.copy || "",
    assetCount: (li.assets || []).length,
    comments: (p.comments || []).map((c) => ({ id: c.id, text: c.message ?? c.text, author: c.user?.email || c.author })),
  };
}

const metricsCache = new Map();

export const live = {
  name: "live",
  live: true,

  async getPost(workspace, postId) {
    return toPost(await call("ordinal_search_content", {
      workspaceSlug: workspace, postId, contentType: "post", includeComments: true,
      limit: 1, sortBy: "createdAt", sortOrder: "desc",
    }));
  },

  async listApprovals(workspace, postId) {
    const res = await call("ordinal_list_approvals", { workspaceSlug: workspace, postId });
    return (res.approvals || []).map((a) => ({
      status: a.status, // "Requested" | "Approved"
      user: a.user?.email || a.user?.firstName || null,
      dueDate: a.dueDate || null,
    }));
  },

  // All posts publishing in [from, to]. Used by the monthly plan generator.
  async listPosts(workspace, { from, to, labelIds }) {
    const out = [];
    let cursor;
    do {
      const res = await call("ordinal_search_content", {
        workspaceSlug: workspace, contentType: "post", includeComments: false,
        limit: 100, sortBy: "publishAt", sortOrder: "asc",
        publishDateMin: `${from}T00:00:00Z`, publishDateMax: `${to}T23:59:59Z`,
        ...(labelIds?.length ? { labelIds } : {}),
        ...(cursor ? { cursor } : {}),
      });
      out.push(...(res.items || []).map(toPost));
      cursor = res.nextCursor || null;
    } while (cursor && out.length < 500);
    return out;
  },

  async getLabels(workspace) {
    const res = await call("ordinal_get_workspace_context", { workspaceSlug: workspace, include: ["labels"] });
    return (res.labels || []).map((l) => ({ id: l.id, name: l.name }));
  },

  // LinkedIn post analytics for one profile, keyed by Ordinal post id. Cached 10 min.
  async getPostMetrics(workspace, profileId, { from, to }) {
    const key = `${workspace}:${profileId}:${from}:${to}`;
    const hit = metricsCache.get(key);
    if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.data;
    const byPost = {};
    let cursor;
    let pages = 0;
    do {
      const res = await call("ordinal_get_analytics", {
        workspaceSlug: workspace, platform: "LinkedIn", type: "posts", profileId, limit: 25,
        startDate: `${from}T00:00:00Z`, endDate: `${to}T23:59:59Z`,
        ...(cursor ? { cursor } : {}),
      });
      for (const it of res.items || []) {
        if (!it.ordinalPost?.id) continue;
        byPost[it.ordinalPost.id] = {
          impressions: it.impressionCount ?? 0,
          reactions: it.likeCount ?? 0,
          comments: it.commentCount ?? 0,
          reposts: it.shareCount ?? 0,
          saves: it.saveCount ?? 0,
          sends: it.sendCount ?? 0,
          profileViews: it.profileViewFromContentCount ?? 0,
          followersGained: it.followerGainedFromContentCount ?? 0,
          engagementRate: it.engagement ?? null,
          linkedInUrl: it.url,
          publishedAt: it.publishedAt,
        };
      }
      cursor = res.hasMore ? res.nextCursor : null;
    } while (cursor && ++pages < 8);
    metricsCache.set(key, { at: Date.now(), data: byPost });
    return byPost;
  },

  async addComment(workspace, postId, message) {
    return call("ordinal_manage_comments", { workspaceSlug: workspace, action: "create", createData: { postId, message } });
  },
};
