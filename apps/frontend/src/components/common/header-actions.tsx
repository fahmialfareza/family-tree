"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { SIGNED_IN_COOKIE } from "@/lib/session-hint";

const signedInPattern = new RegExp(`(?:^|;\\s*)${SIGNED_IN_COOKIE}=1(?:;|$)`);
const noop = () => () => {};

/** Marketing header buttons. The page is prerendered, so the session is read in the browser. */
export function HeaderActions() {
  const t = useTranslations("marketing");
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
