"use client";

import { CloudOff, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { PageContainer } from "@/components/common/page";
import { Button } from "@/components/ui/button";

/** An app page that wasn't saved for offline use: say so, and go back to it once the connection is back. */
export function OfflinePage({ treeId }: { treeId: string }) {
  const t = useTranslations("offline");
  const from = useSearchParams().get("from");
  // Only pages of this app: never an address from elsewhere.
  const target = from && from.startsWith("/app") ? from : `/app/t/${treeId}`;

  useEffect(() => {
    const back = () => window.location.assign(target);
    window.addEventListener("online", back);
    return () => window.removeEventListener("online", back);
  }, [target]);

  return (
    <PageContainer>
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <CloudOff className="size-12 text-muted-foreground" aria-hidden />
        <h1 className="font-display text-2xl font-semibold">{t("pageTitle")}</h1>
        <p className="max-w-md text-muted-foreground">{t("pageBody")}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => window.location.assign(target)}>
            <RotateCcw className="size-4" aria-hidden /> {t("retry")}
          </Button>
          <Button asChild variant="outline">
            <Link href={`/app/t/${treeId}`}>{t("toTree")}</Link>
          </Button>
        </div>
      </div>
    </PageContainer>
  );
}
