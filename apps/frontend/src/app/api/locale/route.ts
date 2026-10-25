import { NextRequest, NextResponse } from "next/server";
import { isLocale, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "@/i18n/config";
import { clientIpHeaders, serverEnv } from "@/lib/server/env";
import { ACCESS_COOKIE, isSameOrigin } from "@/lib/server/session";

// Language switcher: {locale: "en" | "id"} -> cookie for a year, and saved on the account when signed in
// so the choice follows the user to other devices.
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ status: 403, message: "Cross-site request blocked" }, { status: 403 });
  }
  const { locale } = (await req.json().catch(() => ({}))) as { locale?: string };
  if (!isLocale(locale)) {
    return NextResponse.json({ status: 400, message: "Unsupported locale" }, { status: 400 });
  }
  const access = req.cookies.get(ACCESS_COOKIE)?.value;
  if (access) {
    // Best effort: the cookie alone still switches this browser.
    await fetch(`${serverEnv.backendUrl}/api/me`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${access}`, ...clientIpHeaders(req) },
      body: JSON.stringify({ locale }),
      cache: "no-store",
    }).catch(() => null);
  }
  const res = NextResponse.json({ status: 200, data: locale });
  res.cookies.set(LOCALE_COOKIE, locale, { path: "/", maxAge: LOCALE_COOKIE_MAX_AGE, sameSite: "lax" });
  return res;
}
