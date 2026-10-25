import "server-only";

import type { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "@/i18n/config";
import type { TokenPair } from "@/lib/api/types";
import { clientIpHeaders, serverEnv } from "./env";

// Session cookies. Both are httpOnly, so page JavaScript can never read a token.
// The access cookie expires shortly before the token itself; when it is gone and the refresh
// cookie is still there, middleware.ts (or the API proxy) refreshes transparently.
export const ACCESS_COOKIE = "ft_access";
export const REFRESH_COOKIE = "ft_refresh";
export const OAUTH_BINDING_COOKIE = "ft_oauth_binding";

const REFRESH_MAX_AGE = 30 * 24 * 60 * 60;

type CookieJar = Pick<NextResponse["cookies"], "set" | "delete">;

function baseCookie() {
  return { httpOnly: true, secure: serverEnv.secureCookies, sameSite: "lax" as const, path: "/" };
}

export function setSessionCookies(jar: CookieJar, pair: TokenPair) {
  const expiresIn = Math.floor((new Date(pair.accessTokenExpiresAt).getTime() - Date.now()) / 1000);
  jar.set(ACCESS_COOKIE, pair.accessToken, { ...baseCookie(), maxAge: Math.max(expiresIn - 30, 30) });
  if (pair.refreshToken) {
    jar.set(REFRESH_COOKIE, pair.refreshToken, { ...baseCookie(), maxAge: REFRESH_MAX_AGE });
  }
  // The account's language wins over whatever this browser had (see i18n/request.ts).
  if (isLocale(pair.user?.locale)) {
    jar.set(LOCALE_COOKIE, pair.user.locale, { path: "/", maxAge: LOCALE_COOKIE_MAX_AGE, sameSite: "lax" });
  }
}

export function clearSessionCookies(jar: CookieJar) {
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}

export function setBindingCookie(jar: CookieJar, value: string) {
  jar.set(OAUTH_BINDING_COOKIE, value, { ...baseCookie(), maxAge: 10 * 60 });
}

/** Exchanges a refresh token for a new pair; null when the session is gone. */
export async function refreshSession(refreshToken: string, req?: NextRequest): Promise<TokenPair | null> {
  const userAgent = req?.headers.get("user-agent");
  const res = await fetch(`${serverEnv.backendUrl}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(userAgent ? { "User-Agent": userAgent } : {}), ...clientIpHeaders(req) },
    body: JSON.stringify({ refreshToken }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const body = await res.json();
  return body?.data ?? null;
}

/** Server components: the current access token, if any. */
export async function getAccessToken(): Promise<string | undefined> {
  return (await cookies()).get(ACCESS_COOKIE)?.value;
}

/**
 * Rejects cross-site state-changing requests. SameSite=Lax cookies already stop most of them; this
 * also covers same-site subdomains and old browsers.
 */
export function isSameOrigin(req: NextRequest): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;
  const origin = req.headers.get("origin");
  if (origin) {
    return origin === new URL(serverEnv.appUrl).origin || origin === req.nextUrl.origin;
  }
  return req.headers.get("sec-fetch-site") === "same-origin";
}
