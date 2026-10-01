// Builds next month's plan from what is on the Ordinal calendar. This replaces the
// manual "map the table to Ordinal, then run the content-plan skill" loop: posts,
// dates, angles (from "Pillar: X" labels) and statuses come straight from Ordinal;
// the narrative fields (intro, "why this number", asks) start from last month and
// are edited in the admin view or by asking Claude.
import { ordinal, planStatus, angleFromLabels } from "./ordinal/index.js";
import { FRAMEWORKS, statusLabel, fmtDate } from "./plans.js";
import { getPlan, createPlan } from "./store.js";

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function monthBounds(month) {
  const start = new Date(`${month}-01T00:00:00Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(0);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

function typeFromLabels(labels, assetCount) {
  const l = labels.map((x) => x.toLowerCase());
  if (l.some((x) => x.includes("carousel"))) return "Carousel";
  if (l.some((x) => x.includes("video"))) return "Video";
  if (l.some((x) => x.includes("visual") || x.includes("image") || x.includes("graphic"))) return "Image";
  return assetCount ? "Image" : "Text";
}

export async function generatePlan({ fromPlanId, month, client, person, workspace, personLabel, framework }) {
  const prev = fromPlanId ? getPlan(fromPlanId) : null;
  client ||= prev?.client;
  person ||= prev?.person;
  workspace ||= prev?.ordinalWorkspace;
  framework ||= prev?.framework || "The Four Angles";
  if (!client || !person || !workspace || !/^\d{4}-\d{2}$/.test(month || "")) {
    throw Object.assign(new Error("need client, person, workspace and month (YYYY-MM)"), { status: 400 });
  }
  const angleNames = FRAMEWORKS[framework] || FRAMEWORKS["The Four Angles"];
  const { from, to } = monthBounds(month);

  // Narrow to this person's posts by their Ordinal label (e.g. "Whitney") when given.
  let labelIds;
  const label = personLabel || (prev ? person.split(" ")[0] : null);
  if (label) {
    const labels = await ordinal.getLabels(workspace);
    const hit = labels.find((l) => l.name.toLowerCase() === label.toLowerCase());
    if (hit) labelIds = [hit.id];
  }
  let posts = await ordinal.listPosts(workspace, { from, to, labelIds });
  if (!ordinal.live && label) posts = posts.filter((p) => p.labels.some((l) => l.toLowerCase() === label.toLowerCase()));

  const out = [];
  for (const [i, p] of posts.entries()) {
    const approvals = p.ordinalStatus === "Posted" ? [] : await ordinal.listApprovals(workspace, p.ordinalPostId);
    const status = planStatus(p.ordinalStatus, approvals);
    out.push({
      id: `p${String(i + 1).padStart(2, "0")}`,
      date: p.date,
      dateLabel: fmtDate(p.date),
      angle: angleFromLabels(p.labels, angleNames) || "Unassigned",
      topicTag: "",
      title: p.title,
      type: typeFromLabels(p.labels, p.assetCount),
      channels: p.channels.map((c) => (c === "LinkedIn" ? "LI" : c)),
      status,
      statusLabel: statusLabel(status),
      ordinalUrl: p.url,
      ordinalPostId: p.ordinalPostId,
      profileId: p.profileId,
      ...(p.profileName && p.profileName !== person ? { account: p.profileName } : {}),
    });
  }

  const prevWhy = Object.fromEntries((prev?.angles || []).map((a) => [a.name, a]));
  const names = [...new Set([...angleNames, ...out.map((p) => p.angle)])];
  const angles = names.map((name) => ({
    name,
    target: out.filter((p) => p.angle === name).length,
    why: "",
    description: prevWhy[name]?.description || "",
    forYou: prevWhy[name]?.forYou || "",
  }));

  const waitingOn = out
    .filter((p) => p.status === "approval_waiting")
    .slice(0, 6)
    .map((p) => ({ when: fmtDate(p.date), ask: `Approve "${p.title}" in Ordinal.`, done: false, postId: p.id }));

  const monthName = new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  const plan = {
    id: `${slug(`${client}-${person}`)}-${month}`,
    client,
    person,
    month,
    framework,
    angleWord: framework === "The Five Pillars" ? "Pillar" : "Angle",
    periodLabel: `${fmtDate(from).replace(/^\w+, /, "")} – ${fmtDate(to).replace(/^\w+, /, "")} ${month.slice(0, 4)}`,
    preparedOn: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    intro: out.length
      ? `${out.length} posts on the ${monthName} calendar. Each post belongs to one ${framework === "The Five Pillars" ? "pillar" : "angle"} and carries a short topic tag.`
      : `Nothing is on the Ordinal calendar for ${monthName} yet. Posts appear here as soon as they are added.`,
    waitingLabel: "Waiting On You",
    waitingOn,
    angles,
    accounts: [...new Set(out.map((p) => p.account).filter(Boolean))],
    posts: out,
    sections: [],
    cta: prev?.cta || "",
    bookingUrl: prev?.bookingUrl || "",
    ordinalWorkspace: workspace,
    draft: true,
    generatedFrom: { adapter: ordinal.name, fromPlanId: fromPlanId || null, at: new Date().toISOString() },
  };
  return createPlan(plan);
}
