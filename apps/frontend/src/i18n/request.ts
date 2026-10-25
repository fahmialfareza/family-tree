import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { isLocale, LOCALE_COOKIE, type Locale } from "./config";

export { LOCALE_COOKIE, locales, type Locale } from "./config";

// Countries whose visitors get Indonesian when they have not chosen a language.
const INDONESIAN_COUNTRIES = new Set(["ID"]);

/**
 * Language, in order of preference (URLs stay locale-free):
 * 1. the account's language: copied into the NEXT_LOCALE cookie at sign-in (lib/server/session.ts)
 * 2. the NEXT_LOCALE cookie: the last choice in this browser (language switcher)
 * 3. the visitor's country from the IP: Cloudflare's cf-ipcountry header (Vercel's as a fallback)
 * 4. the browser's Accept-Language, when the country is unknown (local development), else English
 */
export async function resolveLocale(): Promise<Locale> {
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  const h = await headers();
  const country = (h.get("cf-ipcountry") ?? h.get("x-vercel-ip-country") ?? "").toUpperCase();
  // XX = unknown, T1 = Tor: no real location.
  if (/^[A-Z]{2}$/.test(country) && country !== "XX" && country !== "T1") {
    return INDONESIAN_COUNTRIES.has(country) ? "id" : "en";
  }
  return /^\s*(id|in)\b/i.test(h.get("accept-language") ?? "") ? "id" : "en";
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  return {
    locale,
    timeZone: "Asia/Jakarta",
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
