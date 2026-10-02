// Plan storage. Plans live as JSON documents; this file-backed store is enough for
// a single Replit instance. To scale out, swap these functions for Replit DB /
// Postgres — every read and write in the app goes through this module.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";

const ROOT = path.resolve(process.env.DATA_DIR || "data");
const SEED_DIR = path.join(ROOT, "seed");
const STORE_DIR = path.join(ROOT, "store");
const PLANS_DIR = path.join(STORE_DIR, "plans");

// Every change to a plan is emitted here; the SSE route fans it out to viewers.
export const changes = new EventEmitter();
changes.setMaxListeners(0);

const cache = new Map();

function planFile(id) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`bad plan id: ${id}`);
  return path.join(PLANS_DIR, `${id}.json`);
}

function writeAtomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

// On first boot, copy the seed plans (imported from the October PDFs) into the
// writable store and give each one a share token for its client link.
export function init() {
  fs.mkdirSync(PLANS_DIR, { recursive: true });
  if (!fs.existsSync(SEED_DIR)) return;
  for (const f of fs.readdirSync(SEED_DIR).filter((f) => f.endsWith(".json"))) {
    const target = path.join(PLANS_DIR, f);
    if (fs.existsSync(target)) continue;
    const plan = JSON.parse(fs.readFileSync(path.join(SEED_DIR, f), "utf8"));
    writeAtomic(target, normalize(plan));
  }
}

export function normalize(plan) {
  plan.shareToken ||= crypto.randomBytes(12).toString("base64url");
  plan.feedback ||= [];
  plan.activity ||= [];
  plan.angleRequests ||= [];
  plan.updatedAt ||= new Date().toISOString();
  plan.posts.forEach((p) => {
    p.metrics ??= null;
  });
  return plan;
}

export function listPlans() {
  return fs
    .readdirSync(PLANS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => getPlan(f.replace(/\.json$/, "")))
    .filter(Boolean)
    .sort((a, b) => a.client.localeCompare(b.client) || a.person.localeCompare(b.person));
}

export function getPlan(id) {
  if (cache.has(id)) return cache.get(id);
  let file;
  try {
    file = planFile(id);
  } catch {
    return null;
  }
  if (!fs.existsSync(file)) return null;
  const plan = normalize(JSON.parse(fs.readFileSync(file, "utf8")));
  cache.set(id, plan);
  return plan;
}

export function savePlan(plan, change) {
  plan.updatedAt = new Date().toISOString();
  if (change) {
    plan.activity.unshift({ at: plan.updatedAt, ...change });
    plan.activity = plan.activity.slice(0, 200);
  }
  writeAtomic(planFile(plan.id), plan);
  cache.set(plan.id, plan);
  changes.emit("change", { planId: plan.id, change: change || null });
  return plan;
}

// Apply a mutation and persist. `fn` returns a change record (or null for no-op).
export function updatePlan(id, fn) {
  const plan = getPlan(id);
  if (!plan) throw Object.assign(new Error("plan not found"), { status: 404 });
  const change = fn(plan);
  if (change === null) return plan;
  return savePlan(plan, change);
}

export function createPlan(plan) {
  if (getPlan(plan.id)) throw Object.assign(new Error(`plan ${plan.id} already exists`), { status: 409 });
  return savePlan(normalize(plan), { kind: "created", text: "Plan created" });
}
