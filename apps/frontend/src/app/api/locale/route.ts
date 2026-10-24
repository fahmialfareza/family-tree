import { NextRequest, NextResponse } from "next/server";
import { LOCALE_COOKIE, locales } from "@/i18n/request";
import { isSameOrigin } from "@/lib/server/session";

// Language switcher: {locale: "en" | "id"} -> cookie for a year.
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ status: 403, message: "Cross-site request blocked" }, { status: 403 });
  }
  const { locale } = (await req.json().catch(() => ({}))) as { locale?: string };
  if (!locale || !(locales as readonly string[]).includes(locale)) {
    return NextResponse.json({ status: 400, message: "Unsupported locale" }, { status: 400 });
  }
  const res = NextResponse.json({ status: 200, data: locale });
  res.cookies.set(LOCALE_COOKIE, locale, { path: "/", maxAge: 365 * 24 * 60 * 60, sameSite: "lax" });
  return res;
}
