import { NextRequest, NextResponse } from "next/server";
import { clientIpHeaders, serverEnv } from "@/lib/server/env";
import { OAUTH_BINDING_COOKIE, setSessionCookies } from "@/lib/server/session";
import { safeNext } from "@/lib/safe-next";
import type { TokenPair } from "@/lib/api/types";

// The API redirects here after Google sign-in with a one-time code. It is exchanged together with this
// browser's binding value, then the user lands on `next` (re-validated: only local paths).
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const next = safeNext(req.nextUrl.searchParams.get("next"), "/app");
  const binding = req.cookies.get(OAUTH_BINDING_COOKIE)?.value;
  const fail = (reason: string) => {
    const res = NextResponse.redirect(new URL(`/auth/login?error=${reason}`, serverEnv.appUrl));
    res.cookies.delete(OAUTH_BINDING_COOKIE);
    return res;
  };
  if (!code || !binding) return fail("google_state");

  const apiRes = await fetch(`${serverEnv.backendUrl}/api/auth/google/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": req.headers.get("user-agent") ?? "", ...clientIpHeaders(req) },
    body: JSON.stringify({ code, binding }),
    cache: "no-store",
  });
  const json = (await apiRes.json().catch(() => null)) as { data?: TokenPair } | null;
  if (!apiRes.ok || !json?.data?.accessToken) return fail("google_exchange");

  const res = NextResponse.redirect(new URL(next === "/" ? "/app" : next, serverEnv.appUrl));
  res.cookies.delete(OAUTH_BINDING_COOKIE);
  setSessionCookies(res.cookies, json.data);
  // No Clear-Site-Data here: on this navigation it leaves the Android app's web view on a blank page. The
  // app shell's claimOfflineData() drops a previous account's offline copy once the new session loads.
  return res;
}
