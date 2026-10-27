import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AppDownloadBanner } from "@/components/marketing/app-download-banner";
import { type LocaleParams, pageLocale } from "@/i18n/static";
import { Logo } from "@/components/common/logo";
import { HeaderActions } from "@/components/common/header-actions";
import { PreferencesMenu, ThemeToggle } from "@/components/common/preferences";
import { contactEmail } from "@/lib/legal-content";
import { BRAND, SITE_URL } from "@/lib/brand";
import { localePath } from "@/lib/seo";
import { ANDROID_PACKAGE, APP_STORE_ID, isLive } from "@/lib/stores";

// The store apps, for browsers and link previews: Safari's Smart App Banner on iPhone and iPad
// (apple-itunes-app) and App Links (al:*), each once its store has the app.
export const metadata: Metadata = {
  other: {
    ...(isLive("appStore") ? { "apple-itunes-app": `app-id=${APP_STORE_ID}`, "al:ios:app_store_id": APP_STORE_ID, "al:ios:app_name": BRAND } : {}),
    ...(isLive("googlePlay") ? { "al:android:package": ANDROID_PACKAGE, "al:android:app_name": BRAND } : {}),
    "al:web:url": SITE_URL,
  },
};

export default async function MarketingLayout({
  children,
  ...props
}: {
  children: React.ReactNode;
} & LocaleParams) {
  // Links stay inside this language's URLs (/en, /id/privacy) so crawlers see one language per page set.
  const locale = await pageLocale(props);
  const t = await getTranslations("marketing");
  const tm = await getTranslations("meta");
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Logo label={tm("brand")} href={localePath(locale, "/")} />
          <nav
            className="flex items-center gap-1 sm:gap-2"
            aria-label={t("nav")}
          >
            <ThemeToggle />
            <PreferencesMenu />
            <HeaderActions />
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <AppDownloadBanner />
      <footer className="border-t bg-card/50">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            © {new Date().getFullYear()} {tm("brand")}. {t("madeWithCare")}
          </p>
          <nav className="flex flex-wrap gap-4" aria-label={t("footerNav")}>
            <Link href={localePath(locale, "/download")} className="inline-block py-2 hover:text-foreground">
              {t("download")}
            </Link>
            <Link href={localePath(locale, "/privacy")} className="inline-block py-2 hover:text-foreground">
              {t("privacy")}
            </Link>
            <Link href={localePath(locale, "/terms")} className="inline-block py-2 hover:text-foreground">
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
