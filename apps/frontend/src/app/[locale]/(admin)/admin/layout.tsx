import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/common/logo";
import { AppScope } from "@/components/providers/app-scope";
import { ThemeToggle } from "@/components/common/preferences";
import { UserMenu } from "@/components/shell/user-menu";
import { Button } from "@/components/ui/button";
import type { Me } from "@/lib/api/types";
import { BackendError, backendGet } from "@/lib/server/backend";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

// Platform admins only (users.role = admin); everyone else gets the 404 page, so the route is not advertised.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let me: Me;
  try {
    me = await backendGet<Me>("/api/me");
  } catch (err) {
    if (err instanceof BackendError && err.status === 401)
      redirect("/auth/login?next=/admin");
    throw err;
  }
  if (me.user.role !== "admin") notFound();
  const t = await getTranslations("admin");
  return (
    <AppScope>
      <div className="min-h-dvh">
        <header className="sticky top-0 z-30 border-b bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-2">
              <Logo href="/admin" />
              <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
                Admin
              </span>
            </div>
            <div className="flex items-center gap-1 sm:gap-2">
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="hidden sm:inline-flex"
              >
                <Link href="/app">{t("openApp")}</Link>
              </Button>
              <ThemeToggle />
              <UserMenu user={me.user} compact className="p-1" />
            </div>
          </div>
        </header>
        <main
          id="main"
          className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8"
        >
          {children}
        </main>
      </div>
    </AppScope>
  );
}
