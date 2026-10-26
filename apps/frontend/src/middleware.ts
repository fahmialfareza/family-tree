import { NextRequest, NextResponse } from "next/server";
import { isLocale, LOCALE_COOKIE, pickLocale } from "@/i18n/config";
import { SIGNED_IN_COOKIE } from "@/lib/session-hint";

// Runs before every page:
// - picks the language and rewrites /path to /{locale}/path (app/[locale]); URLs never show the locale, and
//   pages that don't read cookies (the marketing site) are prerendered once per language
// - guards /app and /admin: no session cookies at all -> redirect to /auth/login?next=...
// - keeps the session fresh before pages render (server components cannot set cookies): access cookie expired
//   but refresh cookie present -> refresh now and set new cookies
// Only imports plain modules (edge runtime).

const ACCESS_COOKIE = "ft_access";
const REFRESH_COOKIE = "ft_refresh";
// next-intl reads the locale of requests that have no [locale] param set from this header.
const INTL_LOCALE_HEADER = "X-NEXT-INTL-LOCALE";
// Prerendered pages: one URL serves either language, so shared caches must not keep them (Next sends
// s-maxage for prerendered pages). Not no-store, which would keep them out of the back/forward cache.
const PRERENDERED = new Set(["/", "/privacy", "/terms"]);

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
  const { pathname } = req.nextUrl;
  // /en/... and /id/... are internal: send direct visits to the public URL in that language.
  const prefix = pathname.split("/")[1];
  if (isLocale(prefix)) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.slice(prefix.length + 1) || "/";
    url.searchParams.set("lang", prefix);
    return NextResponse.redirect(url);
  }

  const locale = pickLocale({
    lang: req.nextUrl.searchParams.get("lang"),
    cookie: req.cookies.get(LOCALE_COOKIE)?.value,
    country: req.headers.get("cf-ipcountry") ?? req.headers.get("x-vercel-ip-country"),
    acceptLanguage: req.headers.get("accept-language"),
  });
  // Built when returning, so cookies refreshed below are included.
  const next = () => {
    const headers = new Headers(req.headers);
    headers.set(INTL_LOCALE_HEADER, locale);
    const url = req.nextUrl.clone();
    url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
    const res = NextResponse.rewrite(url, { request: { headers } });
    if (PRERENDERED.has(pathname)) res.headers.set("Cache-Control", "private, no-cache");
    return res;
  };
  const access = req.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
  const isApp = pathname.startsWith("/app") || pathname.startsWith("/admin");

  if (access) return next();

  if (refresh) {
    const res = await fetch(`${backendUrl()}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": req.headers.get("user-agent") ?? "", ...clientIpHeaders(req) },
      body: JSON.stringify({ refreshToken: refresh }),
      cache: "no-store",
    }).catch(() => null);
    const body = res?.ok ? await res.json().catch(() => null) : null;
    const pair = body?.data as { accessToken: string; accessTokenExpiresAt: string; refreshToken?: string } | undefined;
    if (pair?.accessToken) {
      // Make the fresh token visible to this request's server components, then persist it.
      req.cookies.set(ACCESS_COOKIE, pair.accessToken);
      const out = next();
      const base = { httpOnly: true, secure: secure(), sameSite: "lax" as const, path: "/" };
      const ttl = Math.floor((new Date(pair.accessTokenExpiresAt).getTime() - Date.now()) / 1000);
      out.cookies.set(ACCESS_COOKIE, pair.accessToken, { ...base, maxAge: Math.max(ttl - 30, 30) });
      // Absent when another request rotated the token a moment ago: keep the refresh cookie it set.
      if (pair.refreshToken) {
        out.cookies.set(REFRESH_COOKIE, pair.refreshToken, { ...base, maxAge: 30 * 24 * 60 * 60 });
        out.cookies.set(SIGNED_IN_COOKIE, "1", { ...base, httpOnly: false, maxAge: 30 * 24 * 60 * 60 });
      }
      return out;
    }
    if (res && (res.status === 401 || res.status === 400)) {
      const out = isApp ? redirectToLogin(req) : next();
      out.cookies.delete(REFRESH_COOKIE);
      out.cookies.delete(SIGNED_IN_COOKIE);
      return out;
    }
    return next(); // API unreachable: let the page show its own error
  }

  return isApp ? redirectToLogin(req) : next();
}

function redirectToLogin(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = "/auth/login";
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Every page; not API routes, build assets, uploads, generated icons/images or files (robots.txt, llms.txt...).
  matcher: ["/((?!api/|_next/|uploads/|icon|apple-icon|opengraph-image|.*\\.).*)"],
};
