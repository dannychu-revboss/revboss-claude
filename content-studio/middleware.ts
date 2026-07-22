import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/_next") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }
  const ok = await verifySessionToken(req.cookies.get(AUTH_COOKIE)?.value);
  if (!ok) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
