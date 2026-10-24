import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { clientIpHeaders, serverEnv } from "./env";
import { ACCESS_COOKIE, isSameOrigin, setSessionCookies } from "./session";
import type { TokenPair } from "@/lib/api/types";

/**
 * Posts the request's JSON body to a Go auth endpoint and relays the answer. When the answer carries a
 * session (pickSession), its tokens are moved into httpOnly cookies and stripped from the JSON.
 */
export async function relayAuth(
  req: NextRequest,
  backendPath: string,
  pickSession: (data: Record<string, unknown>) => TokenPair | undefined,
  { withAccess = false }: { withAccess?: boolean } = {},
) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ status: 403, message: "Cross-site request blocked" }, { status: 403 });
  }
  const body = await req.text();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const ua = req.headers.get("user-agent");
  if (ua) headers["User-Agent"] = ua;
  Object.assign(headers, clientIpHeaders(req));
  const access = req.cookies.get(ACCESS_COOKIE)?.value;
  if (withAccess && access) headers.Authorization = `Bearer ${access}`;

  const res = await fetch(`${serverEnv.backendUrl}${backendPath}`, { method: "POST", headers, body, cache: "no-store" });
  const json = (await res.json().catch(() => null)) as { status: number; data?: Record<string, unknown>; message?: string } | null;
  if (!res.ok || !json?.data) {
    return NextResponse.json(json ?? { status: res.status, message: res.statusText }, { status: res.status });
  }
  const session = pickSession(json.data);
  if (!session) {
    return NextResponse.json(json, { status: res.status });
  }
  const out = NextResponse.json({ status: res.status, data: { ...json.data, session: undefined, user: session.user } }, { status: res.status });
  setSessionCookies(out.cookies, session);
  return out;
}

export function isPair(value: unknown): value is TokenPair {
  return !!value && typeof value === "object" && "accessToken" in value;
}

export function appUrl(path: string) {
  return new URL(path, serverEnv.appUrl);
}
