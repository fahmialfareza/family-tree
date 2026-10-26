"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "@/i18n/config";
import { SIGNED_IN_COOKIE } from "@/lib/session-hint";

const signedInPattern = new RegExp(`(?:^|;\\s*)${SIGNED_IN_COOKIE}=1(?:;|$)`);
const noop = () => () => {};

/** Marketing header buttons. The page is prerendered, so the session is read in the browser. */
export function HeaderActions() {
  const t = useTranslations("marketing");
  const locale = useLocale();
  // Opening a language URL (/en, /id/terms) is a choice: remember it so sign-in and the app follow. Set here, not
  // by the server, so those pages stay cacheable.
  useEffect(() => {
    const onLanguageUrl = window.location.pathname === `/${locale}` || window.location.pathname.startsWith(`/${locale}/`);
    if (onLanguageUrl && !document.cookie.includes(`${LOCALE_COOKIE}=${locale}`)) {
      document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
    }
  }, [locale]);
  const signedIn = useSyncExternalStore(
    noop,
    () => signedInPattern.test(document.cookie),
    () => false,
  );
  if (signedIn) {
    return (
      <Button asChild>
        <Link href="/app">{t("openApp")}</Link>
      </Button>
    );
  }
  return (
    <>
      <Button asChild variant="ghost" className="hidden sm:inline-flex">
        <Link href="/auth/login">{t("signIn")}</Link>
      </Button>
      <Button asChild>
        <Link href="/auth/signup">{t("getStarted")}</Link>
      </Button>
    </>
  );
}
