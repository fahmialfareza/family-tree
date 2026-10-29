import { NextRequest, NextResponse } from "next/server";
import { safeNext } from "@/lib/safe-next";
import { serverEnv } from "@/lib/server/env";
import { ACCESS_COOKIE, clearSessionCookies } from "@/lib/server/session";

// Pages whose API calls are refused (401) come here: server components cannot change cookies. While the access
// cookie stays, middleware.ts lets /app through and /auth/login bounces back to /app, so a revoked session would
// redirect forever. Clears the session cookies, but only once the API confirms the token is refused, so a link
// from another site cannot sign anyone out.
export async function GET(req: NextRequest) {
  const next = safeNext(req.nextUrl.searchParams.get("next"), "/app");
  const token = req.cookies.get(ACCESS_COOKIE)?.value;
  const status = token
    ? await fetch(`${serverEnv.backendUrl}/api/me`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      })
        .then((res) => res.status)
        .catch(() => 0)
    : 401;
  if (status !== 401) return NextResponse.redirect(new URL(next, serverEnv.appUrl));
  const out = NextResponse.redirect(new URL(`/auth/login?next=${encodeURIComponent(next)}`, serverEnv.appUrl));
  clearSessionCookies(out.cookies);
  return out;
}
