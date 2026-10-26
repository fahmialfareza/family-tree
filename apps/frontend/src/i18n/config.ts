// Shared by middleware.ts (edge), the next-intl request config, the language switcher route and the session cookies.
export const locales = ["en", "id"] as const;
export type Locale = (typeof locales)[number];
export const LOCALE_COOKIE = "NEXT_LOCALE";
export const LOCALE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

export function isLocale(value: string | null | undefined): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}

// Countries whose visitors get Indonesian when they have not chosen a language.
const INDONESIAN_COUNTRIES = new Set(["ID"]);

/**
 * Language, in order of preference (URLs stay locale-free):
 * 0. ?lang=en|id on public pages: the language versions search engines index (they crawl without cookies and
 *    mostly from US IPs)
 * 1. the account's language: copied into the NEXT_LOCALE cookie at sign-in (lib/server/session.ts)
 * 2. the NEXT_LOCALE cookie: the last choice in this browser (language switcher)
 * 3. the visitor's country from the IP: Cloudflare's cf-ipcountry header (Vercel's as a fallback)
 * 4. the browser's Accept-Language, when the country is unknown (local development), else English
 */
export function pickLocale(from: { lang?: string | null; cookie?: string | null; country?: string | null; acceptLanguage?: string | null }): Locale {
  if (isLocale(from.lang)) return from.lang;
  if (isLocale(from.cookie)) return from.cookie;
  const country = (from.country ?? "").toUpperCase();
  // XX = unknown, T1 = Tor: no real location.
  if (/^[A-Z]{2}$/.test(country) && country !== "XX" && country !== "T1") {
    return INDONESIAN_COUNTRIES.has(country) ? "id" : "en";
  }
  return /^\s*(id|in)\b/i.test(from.acceptLanguage ?? "") ? "id" : "en";
}
