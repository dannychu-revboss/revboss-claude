import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { DATA_DIR } from "./config.ts";
import type { ClientConfig, Transcript } from "./types.ts";

// File-backed store. Each client is one JSON file; each chat transcript is one JSON file.
// Swap this module for a database (Postgres, Airtable) without touching the rest of the app.

const ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function isValidId(id: string): boolean {
  return ID_RE.test(id);
}

function assertId(id: string): void {
  if (!isValidId(id)) throw new Error(`invalid id: ${id}`);
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

export function newAccessToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2) + "\n");
  await fs.rename(tmp, file);
}

const clientsDir = () => path.join(DATA_DIR, "clients");
const transcriptsDir = (clientId: string) => path.join(DATA_DIR, "transcripts", clientId);

export async function listClients(): Promise<ClientConfig[]> {
  await fs.mkdir(clientsDir(), { recursive: true });
  const files = (await fs.readdir(clientsDir())).filter((f) => f.endsWith(".json"));
  const clients = await Promise.all(files.map((f) => readJson<ClientConfig>(path.join(clientsDir(), f))));
  return clients.filter((c): c is ClientConfig => c !== null).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getClient(id: string): Promise<ClientConfig | null> {
  if (!isValidId(id)) return null;
  return readJson<ClientConfig>(path.join(clientsDir(), `${id}.json`));
}

export async function saveClient(client: ClientConfig): Promise<void> {
  assertId(client.id);
  await writeJson(path.join(clientsDir(), `${client.id}.json`), client);
}

export async function deleteClient(id: string): Promise<void> {
  assertId(id);
  await fs.rm(path.join(clientsDir(), `${id}.json`), { force: true });
}

export async function listTranscripts(clientId: string): Promise<Array<Pick<Transcript, "id" | "title" | "createdAt" | "updatedAt">>> {
  assertId(clientId);
  const dir = transcriptsDir(clientId);
  await fs.mkdir(dir, { recursive: true });
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
  const items = await Promise.all(files.map((f) => readJson<Transcript>(path.join(dir, f))));
  return items
    .filter((t): t is Transcript => t !== null)
    .map(({ id, title, createdAt, updatedAt }) => ({ id, title, createdAt, updatedAt }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getTranscript(clientId: string, id: string): Promise<Transcript | null> {
  if (!isValidId(clientId) || !isValidId(id)) return null;
  return readJson<Transcript>(path.join(transcriptsDir(clientId), `${id}.json`));
}

export async function saveTranscript(t: Transcript): Promise<void> {
  assertId(t.clientId);
  assertId(t.id);
  await writeJson(path.join(transcriptsDir(t.clientId), `${t.id}.json`), t);
}

export async function deleteTranscript(clientId: string, id: string): Promise<void> {
  assertId(clientId);
  assertId(id);
  await fs.rm(path.join(transcriptsDir(clientId), `${id}.json`), { force: true });
}
