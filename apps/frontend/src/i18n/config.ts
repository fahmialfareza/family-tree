// Shared by the next-intl request config, the language switcher route and the session cookies.
export const locales = ["en", "id"] as const;
export type Locale = (typeof locales)[number];
export const LOCALE_COOKIE = "NEXT_LOCALE";
export const LOCALE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

export function isLocale(value: string | null | undefined): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}
