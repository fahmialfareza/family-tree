import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/common/logo";
import { PreferencesMenu, ThemeToggle } from "@/components/common/preferences";
import { WelcomeSlides } from "@/components/native/welcome-slides";
import { Button } from "@/components/ui/button";
import { safeNext } from "@/lib/safe-next";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * First screen of the desktop/mobile app for signed-out users, instead of the marketing landing page
 * (middleware.ts sends app clients here; web visitors are sent to the landing page).
 */
export default async function WelcomePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const t = await getTranslations("welcome");
  const tm = await getTranslations("meta");
  const next = encodeURIComponent(safeNext((await searchParams).next, "/app"));
  const slides = (["tree", "family", "ask"] as const).map((icon, i) => ({
    icon,
    title: t(`s${i + 1}Title`),
    body: t(`s${i + 1}Body`),
    label: t("slide", { n: i + 1, total: 3 }),
  }));
  return (
    <div className="flex min-h-dvh flex-col bg-[radial-gradient(ellipse_at_top,var(--color-secondary),transparent_65%)]">
      <header className="flex items-center justify-between px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8">
        <Logo label={tm("brand")} href="/welcome" />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <PreferencesMenu />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center py-6">
        <h1 className="sr-only">{t("title")}</h1>
        <WelcomeSlides slides={slides} label={t("slides")} />
      </main>
      <footer className="mx-auto w-full max-w-sm space-y-3 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2">
        <Button asChild size="lg" className="h-12 w-full text-base">
          <Link href={`/auth/signup?next=${next}`}>{t("signUp")}</Link>
        </Button>
        <Button asChild size="lg" variant="ghost" className="h-12 w-full text-base">
          <Link href={`/auth/login?next=${next}`}>{t("signIn")}</Link>
        </Button>
        <p className="text-center text-xs text-muted-foreground">{t("footnote")}</p>
      </footer>
    </div>
  );
}
