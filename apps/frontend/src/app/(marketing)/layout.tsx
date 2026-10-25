import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/common/logo";
import { PreferencesMenu, ThemeToggle } from "@/components/common/preferences";
import { Button } from "@/components/ui/button";
import { contactEmail } from "@/lib/legal-content";
import { getAccessToken } from "@/lib/server/session";

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("marketing");
  const tm = await getTranslations("meta");
  const signedIn = !!(await getAccessToken());
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Logo label={tm("brand")} labelClassName="max-[399px]:sr-only" />
          <nav
            className="flex items-center gap-1 sm:gap-2"
            aria-label={t("nav")}
          >
            <ThemeToggle />
            <PreferencesMenu />
            {signedIn ? (
              <Button asChild>
                <Link href="/app">{t("openApp")}</Link>
              </Button>
            ) : (
              <>
                <Button
                  asChild
                  variant="ghost"
                  className="hidden sm:inline-flex"
                >
                  <Link href="/auth/login">{t("signIn")}</Link>
                </Button>
                <Button asChild>
                  <Link href="/auth/signup">{t("getStarted")}</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t bg-card/50">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            © {new Date().getFullYear()} {tm("brand")}. {t("madeWithCare")}
          </p>
          <nav className="flex flex-wrap gap-4" aria-label={t("footerNav")}>
            <Link href="/privacy" className="inline-block py-2 hover:text-foreground">
              {t("privacy")}
            </Link>
            <Link href="/terms" className="inline-block py-2 hover:text-foreground">
              {t("terms")}
            </Link>
            {contactEmail ? (
              <a
                href={`mailto:${contactEmail}`}
                className="inline-block py-2 hover:text-foreground"
              >
                {t("contact")}
              </a>
            ) : null}
          </nav>
        </div>
      </footer>
    </div>
  );
}
