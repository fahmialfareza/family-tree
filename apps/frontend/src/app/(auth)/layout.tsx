import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/common/logo";
import { PreferencesMenu, ThemeToggle } from "@/components/common/preferences";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("meta");
  return (
    <div className="relative flex min-h-dvh flex-col bg-[radial-gradient(ellipse_at_top,var(--color-secondary),transparent_60%)]">
      <header className="flex items-center justify-between px-4 py-4 sm:px-8">
        <Logo label={t("brand")} />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <PreferencesMenu />
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:items-center sm:pt-0">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
