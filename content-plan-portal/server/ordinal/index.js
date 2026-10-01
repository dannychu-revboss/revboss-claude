// Picks the Ordinal adapter: live when ORDINAL_MCP_URL is set, demo otherwise.
import { live } from "./live.js";
import { demo } from "./demo.js";

export const ordinal = process.env.ORDINAL_MCP_URL ? live : demo;

// Map an Ordinal post status + its approval requests onto the plan's status
// vocabulary (the same words the PDF plans used).
export function planStatus(ordinalStatus, approvals = []) {
  if (ordinalStatus === "Posted") return "posted";
  const requested = approvals.some((a) => a.status === "Requested");
  const approved = approvals.length > 0 && approvals.every((a) => a.status === "Approved");
  if (requested) return "approval_waiting";
  if (ordinalStatus === "Scheduled" || ordinalStatus === "Finalized" || approved) return "scheduled";
  return "approval_not_sent";
}

// "Pillar: Stance" → "Stance"
export function angleFromLabels(labels, angleNames) {
  for (const l of labels) {
    const m = /^(?:pillar|angle)\s*:\s*(.+)$/i.exec(l);
    if (m) {
      const name = m[1].trim();
      return angleNames.find((a) => a.toLowerCase() === name.toLowerCase()) || name;
    }
  }
  return null;
}
