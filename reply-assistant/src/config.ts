import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(here, "..");
export const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, "data");
export const PORT = Number(process.env.PORT ?? 3000);
export const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-5-5";
export const EFFORT = (process.env.CLAUDE_EFFORT ?? "medium") as "low" | "medium" | "high" | "xhigh" | "max";

export function adminToken(): string | undefined {
  return process.env.ADMIN_TOKEN || undefined;
}
