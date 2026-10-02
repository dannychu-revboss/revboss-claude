import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Run against a throwaway copy of the seed data.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cpp-"));
fs.cpSync(path.resolve("data/seed"), path.join(tmp, "seed"), { recursive: true });
process.env.DATA_DIR = tmp;
delete process.env.ORDINAL_MCP_URL;

const store = await import("../server/store.js");
const { summarize, effectiveStatus, findPost } = await import("../server/plans.js");
const { planStatus, angleFromLabels } = await import("../server/ordinal/index.js");
const { fns } = await import("../server/chat/tools.js");
const { generatePlan } = await import("../server/generator.js");
store.init();

const WHITNEY = "agp-whitney-norman-2026-10";

test("all 19 imported plans load, every post is dated and linked to Ordinal", () => {
  const plans = store.listPlans();
  assert.equal(plans.length, 19);
  for (const p of plans) {
    assert.ok(p.shareToken.length >= 16);
    for (const post of p.posts) {
      assert.match(post.date, /^2026-10-\d\d$/, `${p.id} ${post.title}`);
      assert.ok(post.ordinalPostId, `${p.id} ${post.title} has no Ordinal link`);
    }
    assert.equal(p.angles.reduce((n, a) => n + a.target, 0), p.posts.length, `${p.id} angle budget != posts`);
  }
});

test("summary counts match the October PDF for Whitney", () => {
  const s = summarize(store.getPlan(WHITNEY), "2026-10-01");
  assert.equal(s.total, 12);
  assert.equal(s.counts.posted, 1);
  assert.equal(s.counts.scheduled, 8);
  assert.equal(s.counts.approval_waiting, 3);
});

test("a waiting approval past its date reads as overdue", () => {
  const post = { status: "approval_waiting", date: "2026-10-05" };
  assert.equal(effectiveStatus(post, "2026-10-04"), "approval_waiting");
  assert.equal(effectiveStatus(post, "2026-10-06"), "approval_overdue");
  assert.equal(effectiveStatus({ status: "scheduled", date: "2026-10-05" }, "2026-10-06"), "scheduled");
});

test("Ordinal status + approvals map onto plan statuses", () => {
  assert.equal(planStatus("Posted"), "posted");
  assert.equal(planStatus("Scheduled", [{ status: "Approved" }]), "scheduled");
  assert.equal(planStatus("Scheduled", [{ status: "Requested" }]), "approval_waiting");
  assert.equal(planStatus("ForReview", [{ status: "Requested" }]), "approval_waiting");
  assert.equal(planStatus("ToDo", []), "approval_not_sent");
  assert.equal(angleFromLabels(["Whitney", "Pillar: Stance"], ["Stance"]), "Stance");
  assert.equal(angleFromLabels(["text-only"], ["Stance"]), null);
});

test("findPost resolves by id, Ordinal id and title fragment", () => {
  const plan = store.getPlan(WHITNEY);
  assert.equal(findPost(plan, "p01").title, "That Was Never My Donor");
  assert.equal(findPost(plan, "fading halo").id, "p04");
  assert.equal(findPost(plan, plan.posts[2].ordinalPostId).id, "p03");
  assert.equal(findPost(plan, "no such post"), null);
});

test("chat tools: feedback is saved, asks can be completed", async () => {
  const r = await fns.leaveFeedback(WHITNEY, { post: "p08", message: "Swap the opener", author: "Whitney" });
  assert.equal(r.saved, true);
  assert.equal(store.getPlan(WHITNEY).feedback[0].postTitle, "Open With a Name, Not a Number");
  assert.equal(fns.completeAsk(WHITNEY, { index: 0 }).ask.done, true);
  assert.ok(fns.completeAsk(WHITNEY, { index: 99 }).error);
});

test("generator rebuilds a month from the Ordinal calendar", async () => {
  const plan = await generatePlan({ client: "AGP", person: "Whitney Rebuild", workspace: "agp", personLabel: "Whitney", month: "2026-10" });
  assert.equal(plan.posts.length, 12);
  assert.deepEqual(plan.angles.map((a) => [a.name, a.target]), [["Playbook", 1], ["Proof", 2], ["Stance", 7], ["Human", 2]]);
  assert.equal(plan.draft, true);
  const empty = await generatePlan({ fromPlanId: WHITNEY, month: "2026-11" });
  assert.equal(empty.posts.length, 0);
});

test("client angle-change requests wait for the team, then apply or not", async () => {
  const id = "agp-liz-lowe-2026-10";
  const plan = store.getPlan(id);
  const post = plan.posts[0];
  const target = plan.angles.find((a) => a.name !== post.angle).name;

  assert.ok((await fns.requestAngleChange(id, { post: post.id, toAngle: "Nonsense" })).error);
  assert.ok((await fns.requestAngleChange(id, { post: post.id, toAngle: post.angle })).error);

  const r = await fns.requestAngleChange(id, { post: post.id, toAngle: target, note: "reads like proof", author: "Liz" });
  assert.equal(r.request.status, "pending");
  assert.equal(store.getPlan(id).posts[0].angle, post.angle, "nothing moves before approval");
  assert.match(store.getPlan(id).feedback[0].message, new RegExp(`to ${target}`));

  // A second drag replaces the first open request.
  const again = await fns.requestAngleChange(id, { post: post.id, toAngle: target, author: "Liz" });
  assert.equal(store.getPlan(id).angleRequests.filter((x) => x.status === "pending").length, 1);
  assert.equal(store.getPlan(id).angleRequests.find((x) => x.id === r.request.id).status, "replaced");

  assert.equal(fns.decideAngleRequest(id, { id: again.request.id, decision: "approve" }).request.status, "approved");
  assert.equal(store.getPlan(id).posts[0].angle, target);
  assert.ok(fns.decideAngleRequest(id, { id: again.request.id, decision: "decline" }).error, "can't decide twice");
});
