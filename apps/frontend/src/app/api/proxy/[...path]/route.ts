import { NextRequest, NextResponse } from "next/server";
import { clientIpHeaders, serverEnv } from "@/lib/server/env";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearSessionCookies,
  isSameOrigin,
  refreshSession,
  setSessionCookies,
} from "@/lib/server/session";
import type { TokenPair } from "@/lib/api/types";

// Forwards /api/proxy/<path> to the Go API at /<path>, adding the bearer token from the httpOnly cookie.
// If the access token is missing or rejected and a refresh token exists, the session is refreshed once
// and the request retried; new cookies ride back on the response.

const FORWARDED_REQUEST_HEADERS = ["content-type", "accept", "accept-language", "user-agent"];
const FORWARDED_RESPONSE_HEADERS = ["content-type", "content-disposition", "cache-control", "x-request-id"];
// The /api/auth endpoints page code may use. The others answer with tokens (login, refresh, legacy GET /api/auth,
// ...): those go through /api/session/*, which keeps them in httpOnly cookies.
const AUTH_PATHS = new Set(["resend-verification", "forgot-password", "reset-password", "change-password", "sessions", "logout-all"]);

async function forward(req: NextRequest, path: string[], body: ArrayBuffer | undefined, token?: string) {
  const url = new URL(`${serverEnv.backendUrl}/${path.map(encodeURIComponent).join("/")}`);
  url.search = req.nextUrl.search;
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }
  for (const [name, value] of Object.entries(clientIpHeaders(req))) headers.set(name, value);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(url, { method: req.method, headers, body, cache: "no-store", redirect: "manual" });
}

async function handle(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ status: 403, message: "Cross-site request blocked" }, { status: 403 });
  }
  const { path } = await params;
  // "." and ".." would be resolved by new URL() in forward(), stepping around these checks.
  const dotSegment = path.some((s) => s === "." || s === "..");
  if (path[0] !== "api" || dotSegment || (path[1] === "auth" && !AUTH_PATHS.has(path[2] ?? ""))) {
    return NextResponse.json({ status: 404, message: "Not found" }, { status: 404 });
  }
  const body = ["GET", "HEAD"].includes(req.method) ? undefined : await req.arrayBuffer();

  let token = req.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;
  let refreshed: TokenPair | null = null;

  if (!token && refreshToken) {
    refreshed = await refreshSession(refreshToken, req);
    token = refreshed?.accessToken;
  }
  let res = await forward(req, path, body, token);
  if (res.status === 401 && refreshToken && !refreshed) {
    refreshed = await refreshSession(refreshToken, req);
    if (refreshed) res = await forward(req, path, body, refreshed.accessToken);
  }

  const headers = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = res.headers.get(name);
    if (value) headers.set(name, value);
  }
  const out = new NextResponse(res.body, { status: res.status, headers });
  if (refreshed) setSessionCookies(out.cookies, refreshed);
  if (res.status === 401 && (refreshToken || token) && !refreshed) clearSessionCookies(out.cookies);
  return out;
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
