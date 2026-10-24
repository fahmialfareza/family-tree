import { NextRequest, NextResponse } from "next/server";
import { clientIpHeaders, serverEnv } from "@/lib/server/env";
import { ACCESS_COOKIE, clearSessionCookies, isSameOrigin } from "@/lib/server/session";

// Revokes the session on the API (best effort) and clears the cookies.
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ status: 403, message: "Cross-site request blocked" }, { status: 403 });
  }
  const token = req.cookies.get(ACCESS_COOKIE)?.value;
  if (token) {
    await fetch(`${serverEnv.backendUrl}/api/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, ...clientIpHeaders(req) },
      cache: "no-store",
    }).catch(() => undefined);
  }
  const out = NextResponse.json({ status: 200, data: true });
  clearSessionCookies(out.cookies);
  return out;
}
