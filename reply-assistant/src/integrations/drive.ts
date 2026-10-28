import { drive, auth, type drive_v3 } from "@googleapis/drive";
import type { ClientConfig } from "../types.ts";

// Google Drive access via a service account. Share each client's collateral folder with the
// service account's email (Viewer is enough); the assistant can only see those folders.

const MAX_TEXT_CHARS = 60_000;
const MAX_PDF_BYTES = 10 * 1024 * 1024;

let cached: drive_v3.Drive | null = null;

export function driveConfigured(client: ClientConfig): boolean {
  return Boolean(
    client.drive?.folderIds.length &&
      (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS),
  );
}

function getDrive(): drive_v3.Drive {
  if (cached) return cached;
  const scopes = ["https://www.googleapis.com/auth/drive.readonly"];
  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const googleAuth = inline
    ? new auth.GoogleAuth({ credentials: JSON.parse(inline), scopes })
    : new auth.GoogleAuth({ scopes }); // GOOGLE_APPLICATION_CREDENTIALS
  cached = drive({ version: "v3", auth: googleAuth });
  return cached;
}

function escapeQuery(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** Every folder ID the client's tree contains (shared roots + their subfolders, breadth-first). */
async function clientFolderIds(client: ClientConfig): Promise<string[]> {
  const d = getDrive();
  const seen = new Set<string>(client.drive?.folderIds ?? []);
  let frontier = [...seen];
  while (frontier.length && seen.size < 200) {
    const q = `(${frontier.map((id) => `'${escapeQuery(id)}' in parents`).join(" or ")}) and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const res = await d.files.list({ q, fields: "files(id)", pageSize: 200, supportsAllDrives: true, includeItemsFromAllDrives: true });
    frontier = (res.data.files ?? []).map((f) => f.id!).filter((id) => !seen.has(id));
    frontier.forEach((id) => seen.add(id));
  }
  return [...seen];
}

async function assertInClientTree(client: ClientConfig, fileId: string): Promise<drive_v3.Schema$File> {
  const d = getDrive();
  const meta = await d.files.get({ fileId, fields: "id,name,mimeType,size,parents,webViewLink,modifiedTime", supportsAllDrives: true });
  const allowed = new Set(await clientFolderIds(client));
  const assetIds = new Set(client.assets.map((a) => a.driveFileId).filter(Boolean));
  if (!assetIds.has(fileId) && !(meta.data.parents ?? []).some((p) => allowed.has(p))) {
    throw new Error("That file is not in this client's Drive folders.");
  }
  return meta.data;
}

export async function searchFiles(client: ClientConfig, query: string, limit = 10) {
  const d = getDrive();
  const folders = await clientFolderIds(client);
  const parents = folders.map((id) => `'${escapeQuery(id)}' in parents`).join(" or ");
  const text = query.trim() ? ` and (name contains '${escapeQuery(query)}' or fullText contains '${escapeQuery(query)}')` : "";
  const res = await d.files.list({
    q: `(${parents}) and mimeType != 'application/vnd.google-apps.folder' and trashed = false${text}`,
    fields: "files(id,name,mimeType,webViewLink,modifiedTime,description)",
    pageSize: Math.min(limit, 50),
    orderBy: query.trim() ? undefined : "modifiedTime desc",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return (res.data.files ?? []).map((f) => ({
    file_id: f.id,
    name: f.name,
    type: f.mimeType,
    url: f.webViewLink,
    modified: f.modifiedTime,
    description: f.description ?? undefined,
  }));
}

export type DriveContent =
  | { kind: "text"; name: string; url: string; text: string; truncated: boolean }
  | { kind: "pdf"; name: string; url: string; base64: string }
  | { kind: "unsupported"; name: string; url: string; mimeType: string };

export async function readFile(client: ClientConfig, fileId: string): Promise<DriveContent> {
  const d = getDrive();
  const meta = await assertInClientTree(client, fileId);
  const name = meta.name ?? fileId;
  const url = meta.webViewLink ?? "";
  const mime = meta.mimeType ?? "";

  const exportAs: Record<string, string> = {
    "application/vnd.google-apps.document": "text/plain",
    "application/vnd.google-apps.presentation": "text/plain",
    "application/vnd.google-apps.spreadsheet": "text/csv",
  };
  let text: string | null = null;
  if (exportAs[mime]) {
    const res = await d.files.export({ fileId, mimeType: exportAs[mime] }, { responseType: "text" });
    text = String(res.data);
  } else if (mime.startsWith("text/") || mime === "application/json") {
    const res = await d.files.get({ fileId, alt: "media", supportsAllDrives: true }, { responseType: "text" });
    text = String(res.data);
  } else if (mime === "application/pdf" && Number(meta.size ?? 0) <= MAX_PDF_BYTES) {
    const res = await d.files.get({ fileId, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" });
    return { kind: "pdf", name, url, base64: Buffer.from(res.data as ArrayBuffer).toString("base64") };
  }
  if (text === null) return { kind: "unsupported", name, url, mimeType: mime };
  // Large files: tell the model explicitly that it only got the beginning.
  const truncated = text.length > MAX_TEXT_CHARS;
  return { kind: "text", name, url, text: truncated ? text.slice(0, MAX_TEXT_CHARS) : text, truncated };
}
