import { setRequestLocale } from "next-intl/server";
import type { Locale } from "./config";

export type LocaleParams = { params: Promise<{ locale: string }> };

/**
 * The locale of a page under app/[locale] (set by middleware.ts), registered for next-intl so the page can be
 * prerendered: call it first in every layout, page and generateMetadata that should stay static.
 */
export async function pageLocale({ params }: LocaleParams): Promise<Locale> {
  const { locale } = await params;
  setRequestLocale(locale);
  return locale as Locale;
}
