// Simple shared-password auth for an internal tool.
// The session cookie holds an HMAC of a fixed message signed with AUTH_SECRET,
// so it stays valid until AUTH_SECRET or APP_PASSWORD changes.

export const AUTH_COOKIE = "studio_session";

async function hmac(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Buffer.from(new Uint8Array(sig)).toString("hex");
}

export async function sessionToken(): Promise<string> {
  const secret = process.env.AUTH_SECRET || "dev-secret";
  const password = process.env.APP_PASSWORD || "";
  return hmac(`studio-session:${password}`, secret);
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  return token === (await sessionToken());
}
