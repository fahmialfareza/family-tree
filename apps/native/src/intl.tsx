import { useEffect, useState } from "react";
import { IntlProvider } from "use-intl";
import type { Locale } from "@/i18n/config";
import en from "../../frontend/messages/en.json";
import id from "../../frontend/messages/id.json";
import { currentLocale } from "./locale";

const MESSAGES = { en, id } as const;

/** The website's messages and settings (apps/frontend src/i18n/request.ts); the language changes in place. */
export function IntlRoot({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>(currentLocale);
  // "5 minutes ago" needs a now: the website's comes with each page from the server; here it is renewed whenever
  // the app comes back to the front.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const renew = () => document.visibilityState === "visible" && setNow(new Date());
    document.addEventListener("visibilitychange", renew);
    return () => document.removeEventListener("visibilitychange", renew);
  }, []);
  useEffect(() => {
    const onChange = () => setLocale(currentLocale());
    window.addEventListener("sakdulur:locale", onChange);
    return () => window.removeEventListener("sakdulur:locale", onChange);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return (
    <IntlProvider locale={locale} messages={MESSAGES[locale]} timeZone="Asia/Jakarta" now={now}>
      {children}
    </IntlProvider>
  );
}
