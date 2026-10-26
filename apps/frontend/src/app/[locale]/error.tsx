"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errors");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 px-6 text-center">
      <TriangleAlert className="size-12 text-terracotta" aria-hidden />
      <h1 className="font-display text-2xl font-semibold">{t("errorTitle")}</h1>
      <p className="max-w-md text-muted-foreground">{t("errorBody")}</p>
      {error.digest ? <p className="font-mono text-xs text-muted-foreground">{error.digest}</p> : null}
      <div className="flex gap-2">
        <Button onClick={reset}>
          <RotateCcw className="size-4" aria-hidden /> {t("retry")}
        </Button>
        <Button asChild variant="outline">
          <Link href="/app">{t("goHome")}</Link>
        </Button>
      </div>
    </main>
  );
}
