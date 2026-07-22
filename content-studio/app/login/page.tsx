import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE, sessionToken } from "@/lib/auth";

async function login(formData: FormData) {
  "use server";
  const password = String(formData.get("password") || "");
  const next = String(formData.get("next") || "/");
  if (!process.env.APP_PASSWORD || password !== process.env.APP_PASSWORD) {
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }
  const jar = await cookies();
  jar.set(AUTH_COOKIE, await sessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  redirect(next.startsWith("/") ? next : "/");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50">
      <div className="card w-full max-w-sm p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">
            R
          </div>
          <div>
            <h1 className="text-lg font-semibold">RevBoss Content Studio</h1>
            <p className="text-sm text-neutral-500">Team sign in</p>
          </div>
        </div>
        <form action={login} className="space-y-4">
          <input type="hidden" name="next" value={params.next || "/"} />
          <div>
            <label className="label">Team password</label>
            <input
              className="input"
              type="password"
              name="password"
              autoFocus
              placeholder="••••••••"
            />
          </div>
          {params.error && (
            <p className="text-sm text-red-600">Wrong password. Try again.</p>
          )}
          <button className="btn-primary w-full justify-center" type="submit">
            Sign in
          </button>
        </form>
      </div>
    </main>
  );
}
