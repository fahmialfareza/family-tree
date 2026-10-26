import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { isLocale, LOCALE_COOKIE, pickLocale } from "./config";

export { LOCALE_COOKIE, locales, type Locale } from "./config";

export default getRequestConfig(async ({ requestLocale }) => {
  // Pages: the [locale] segment that middleware.ts rewrote to. Route handlers (no segment): the same rules,
  // read from this request.
  const requested = await requestLocale;
  let locale = requested;
  if (!isLocale(locale)) {
    const h = await headers();
    locale = pickLocale({
      cookie: (await cookies()).get(LOCALE_COOKIE)?.value,
      country: h.get("cf-ipcountry") ?? h.get("x-vercel-ip-country"),
      acceptLanguage: h.get("accept-language"),
    });
  }
  return {
    locale,
    timeZone: "Asia/Jakarta",
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
