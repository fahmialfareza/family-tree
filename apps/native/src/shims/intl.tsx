// next-intl for the app: the same hooks, from use-intl (which next-intl is built on). The messages come from the
// app's own IntlProvider (src/intl.tsx), so NextIntlClientProvider has nothing to add.
export { useFormatter, useLocale, useMessages, useNow, useTimeZone, useTranslations } from "use-intl";

export function NextIntlClientProvider({ children }: { children: React.ReactNode }) {
  return children;
}
