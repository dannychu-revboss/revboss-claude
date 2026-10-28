import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildSystemPrompt } from "../src/prompt.ts";
import { ClientSchema } from "../src/schema.ts";
import type { ClientConfig } from "../src/types.ts";

const demo = JSON.parse(fs.readFileSync(new URL("../data/clients/demo.json", import.meta.url), "utf8")) as ClientConfig;

test("demo client config is valid", () => {
  const res = ClientSchema.safeParse(demo);
  assert.ok(res.success, res.success ? "" : res.error.message);
});

test("system prompt includes every scenario, template and asset", () => {
  const prompt = buildSystemPrompt(demo);
  for (const r of demo.matrix) assert.match(prompt, new RegExp(`### ${r.id}: `));
  for (const t of demo.templates) assert.ok(prompt.includes(`### ${t.id}: ${t.name}`));
  for (const a of demo.assets) assert.ok(prompt.includes(`- ${a.id} [${a.type}]`));
  assert.ok(!prompt.includes(demo.accessToken), "access token must never reach the model");
});

test("system prompt is deterministic (cache-friendly)", () => {
  assert.equal(buildSystemPrompt(demo), buildSystemPrompt(structuredClone(demo)));
});

test("schema rejects matrix options that reference missing templates or assets", () => {
  const bad = structuredClone(demo);
  bad.matrix[0].options[0].templateId = "nope";
  bad.matrix[0].options[0].assetIds = ["missing-asset"];
  const res = ClientSchema.safeParse(bad);
  assert.equal(res.success, false);
  const msg = res.success ? "" : res.error.issues.map((i) => i.message).join(" ");
  assert.match(msg, /unknown template "nope"/);
  assert.match(msg, /unknown asset "missing-asset"/);
});

test("schema rejects duplicate ids", () => {
  const bad = structuredClone(demo);
  bad.assets.push({ ...bad.assets[0] });
  assert.equal(ClientSchema.safeParse(bad).success, false);
});
