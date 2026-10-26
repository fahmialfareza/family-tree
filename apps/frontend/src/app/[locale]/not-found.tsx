import { TreePine } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";

export default async function NotFound() {
  const t = await getTranslations("errors");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <TreePine className="size-12 text-primary" aria-hidden />
      <h1 className="font-display text-3xl font-semibold">{t("notFoundTitle")}</h1>
      <p className="max-w-md text-muted-foreground">{t("notFoundBody")}</p>
      <Button asChild>
        <Link href="/app">{t("goHome")}</Link>
      </Button>
    </main>
  );
}
