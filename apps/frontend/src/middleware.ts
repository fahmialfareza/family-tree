import { NextRequest, NextResponse } from "next/server";

// Guards /app and keeps the session fresh before pages render (server components cannot set cookies):
// - no session cookies at all -> redirect to /auth/login?next=...
// - access cookie expired but refresh cookie present -> refresh now and set new cookies
// Kept self-contained (edge runtime) on purpose.

const ACCESS_COOKIE = "ft_access";
const REFRESH_COOKIE = "ft_refresh";

function backendUrl() {
  return (process.env.BACKEND_URL || "http://localhost:4000").replace(/\/+$/, "");
}

// Same contract as lib/server/env.ts clientIpHeaders (kept inline: middleware runs on the edge runtime).
function clientIpHeaders(req: NextRequest): Record<string, string> {
  const secret = process.env.BFF_SHARED_SECRET;
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return secret && ip ? { "X-BFF-Secret": secret, "X-Client-IP": ip } : {};
}

function secure() {
  return (process.env.NEXT_PUBLIC_APP_URL || "").startsWith("https://");
}

export async function middleware(req: NextRequest) {
  const access = req.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
  const isApp = req.nextUrl.pathname.startsWith("/app");

  if (access) return NextResponse.next();

  if (refresh) {
    const res = await fetch(`${backendUrl()}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": req.headers.get("user-agent") ?? "", ...clientIpHeaders(req) },
      body: JSON.stringify({ refreshToken: refresh }),
      cache: "no-store",
    }).catch(() => null);
    const body = res?.ok ? await res.json().catch(() => null) : null;
    const pair = body?.data as { accessToken: string; accessTokenExpiresAt: string; refreshToken: string } | undefined;
    if (pair?.accessToken) {
      // Make the fresh token visible to this request's server components, then persist it.
      req.cookies.set(ACCESS_COOKIE, pair.accessToken);
      const out = NextResponse.next({ request: { headers: req.headers } });
      const base = { httpOnly: true, secure: secure(), sameSite: "lax" as const, path: "/" };
      const ttl = Math.floor((new Date(pair.accessTokenExpiresAt).getTime() - Date.now()) / 1000);
      out.cookies.set(ACCESS_COOKIE, pair.accessToken, { ...base, maxAge: Math.max(ttl - 30, 30) });
      out.cookies.set(REFRESH_COOKIE, pair.refreshToken, { ...base, maxAge: 30 * 24 * 60 * 60 });
      return out;
    }
    if (res && (res.status === 401 || res.status === 400)) {
      const out = isApp ? redirectToLogin(req) : NextResponse.next();
      out.cookies.delete(REFRESH_COOKIE);
      return out;
    }
    return NextResponse.next(); // API unreachable: let the page show its own error
  }

  return isApp ? redirectToLogin(req) : NextResponse.next();
}

function redirectToLogin(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = "/auth/login";
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/app/:path*", "/invite", "/auth/login", "/auth/signup"],
};
