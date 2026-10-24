import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";

// Languages: English and Indonesian. The choice lives in the NEXT_LOCALE cookie (set by the language
// switcher); first visits fall back to the browser's Accept-Language. URLs stay locale-free.
export const locales = ["en", "id"] as const;
export type Locale = (typeof locales)[number];
export const LOCALE_COOKIE = "NEXT_LOCALE";

function isLocale(value: string | undefined): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}

export async function resolveLocale(): Promise<Locale> {
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  const accept = (await headers()).get("accept-language") ?? "";
  return /^\s*(id|in)\b/i.test(accept) ? "id" : "en";
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  return {
    locale,
    timeZone: "Asia/Jakarta",
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
