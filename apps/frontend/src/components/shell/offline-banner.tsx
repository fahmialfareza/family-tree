"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CloudOff } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { useOffline } from "@/lib/offline";

/** "You're offline — showing saved data (updated …)" while offline; refreshes everything when the connection is back. */
export function OfflineBanner() {
  const t = useTranslations("offline");
  const format = useFormatter();
  const queryClient = useQueryClient();
  const { offline, savedAt } = useOffline();
  const wasOffline = useRef(false);

  useEffect(() => {
    if (wasOffline.current && !offline) void queryClient.invalidateQueries();
    wasOffline.current = offline;
  }, [offline, queryClient]);

  // Back online but the data on screen is still the saved copy: a refetch brings fresh data and hides the banner.
  useEffect(() => {
    if (!offline) return;
    const retry = () => void queryClient.invalidateQueries();
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [offline, queryClient]);

  if (!offline) return null;
  const when = savedAt ? new Date(savedAt) : null;
  return (
    <div role="status" className="flex items-center gap-2 border-b bg-secondary px-4 py-2 text-sm text-secondary-foreground">
      <CloudOff className="size-4 shrink-0" aria-hidden />
      <p className="min-w-0">
        <span className="font-medium">{t("title")}</span>{" "}
        <span className="text-muted-foreground">
          {when && !Number.isNaN(when.getTime())
            ? t("savedAt", { when: format.dateTime(when, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) })
            : t("saved")}
        </span>
      </p>
    </div>
  );
}
