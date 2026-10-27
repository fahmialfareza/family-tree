"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { toast } from "sonner";
import { useNativePlatform } from "@/lib/native";

type DownloadDetail = { state: "started" | "finished" | "failed"; id: string; name: string };

/**
 * In the desktop/mobile app, downloads are saved by the app (apps/native), which reports each one with a
 * "sakdulur:download" event: one toast per file goes from "Downloading…" to saved (or failed). Web: nothing.
 * A hook (called by AppProviders) rather than a sibling of the page, which would shift React's useId paths.
 */
export function useDownloadToasts() {
  const t = useTranslations("native");
  const platform = useNativePlatform();

  useEffect(() => {
    if (platform === "web") return;
    const onDownload = (e: Event) => {
      const { state, id, name } = (e as CustomEvent<DownloadDetail>).detail;
      const opts = { id, description: name || undefined };
      if (state === "started") toast.loading(t("downloading"), opts);
      else if (state === "finished") toast.success(t(platform === "ios" ? "savedMobile" : "savedDesktop"), opts);
      else toast.error(t("downloadFailed"), opts);
    };
    window.addEventListener("sakdulur:download", onDownload);
    return () => window.removeEventListener("sakdulur:download", onDownload);
  }, [platform, t]);
}
