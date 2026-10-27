"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useSyncExternalStore } from "react";
import { StoreIcon } from "@/components/marketing/store-badges";
import { Button } from "@/components/ui/button";
import { useNativePlatform } from "@/lib/native";
import { isLive, type StoreId, storeUrl } from "@/lib/stores";

// A bar at the bottom of the public pages pointing visitors to the app for their system (as on dzikirapp.com).
// iPhone and iPad get Apple's own Smart App Banner instead (apple-itunes-app, once the App Store has the app).
const DISMISSED = "sakdulur-download-banner-dismissed";
const QUIET_DAYS = 7;

type Suggestion = { store: StoreId; os: string };

function suggest(): Suggestion | null {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch tells them apart.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return null;
  const pick: Suggestion | null = /Android/.test(ua)
    ? { store: "googlePlay", os: "Android" }
    : /Windows NT/.test(ua)
      ? { store: "microsoftStore", os: "Windows" }
      : /Macintosh|Mac OS X/.test(ua)
        ? { store: "macAppStore", os: "Mac" }
        : /Linux/.test(ua) && !/CrOS/.test(ua)
          ? { store: "snapStore", os: "Linux" }
          : null;
  if (!pick || !isLive(pick.store)) return null;
  const at = Number(localStorage.getItem(DISMISSED) ?? 0);
  return Date.now() - at < QUIET_DAYS * 864e5 ? null : pick;
}

// Read once after hydration (the server can't know the visitor's system); a stable reference per page load.
let cached: Suggestion | null | undefined;
const noSubscribe = () => () => {};
const snapshot = () => (cached === undefined ? (cached = suggest()) : cached);

export function AppDownloadBanner() {
  const t = useTranslations("stores");
  const platform = useNativePlatform();
  const suggestion = useSyncExternalStore(noSubscribe, snapshot, () => null);
  const [closed, setClosed] = useState(false);
  if (platform !== "web" || !suggestion || closed) return null;

  const close = () => {
    localStorage.setItem(DISMISSED, String(Date.now()));
    setClosed(true);
  };
  const store = t(suggestion.store);
  return (
    <div
      role="region"
      aria-label={t("bannerTitle", { os: suggestion.os })}
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-xl items-center gap-3 rounded-2xl border bg-card/95 p-3 shadow-[var(--shadow-lift)] backdrop-blur"
    >
      <StoreIcon id={suggestion.store} className="size-8 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{t("bannerTitle", { os: suggestion.os })}</p>
        <p className="truncate text-xs text-muted-foreground">{t("bannerBody", { store })}</p>
      </div>
      <Button asChild size="sm">
        <a href={storeUrl(suggestion.store)} target="_blank" rel="noopener" onClick={close}>
          {t("bannerGet")}
        </a>
      </Button>
      <Button variant="ghost" size="icon" className="size-8" onClick={close} aria-label={t("bannerClose")}>
        <X className="size-4" aria-hidden />
      </Button>
    </div>
  );
}
