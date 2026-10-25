"use client";

import { Network, Settings, UserRound, Users, UsersRound } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { LogoMark } from "@/components/common/logo";
import { ThemeToggle } from "@/components/common/preferences";
import { useMe } from "@/lib/api/hooks";
import type { Me } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { PersonSearch } from "./search";
import { TreeSwitcher } from "./tree-switcher";
import { UserMenu } from "./user-menu";

type NavItem = { href: string; label: string; icon: typeof Network; exact?: boolean };

export function AppShell({ initialMe, children }: { initialMe: Me; children: React.ReactNode }) {
  const t = useTranslations("shell");
  const params = useParams<{ treeId?: string }>();
  const pathname = usePathname();
  const { data: me = initialMe } = useMe(initialMe);
  const treeId = params.treeId;
  const tree = me.trees.find((x) => x._id === treeId);

  const nav: NavItem[] = treeId
    ? [
        { href: `/app/t/${treeId}`, label: t("tree"), icon: Network, exact: true },
        { href: `/app/t/${treeId}/people`, label: t("people"), icon: UsersRound },
        { href: `/app/t/${treeId}/families`, label: t("families"), icon: Users },
        { href: `/app/t/${treeId}/members`, label: t("members"), icon: UserRound },
        ...(tree?.role === "owner" ? [{ href: `/app/t/${treeId}/settings`, label: t("settings"), icon: Settings }] : []),
      ]
    : [];
  const isActive = (item: NavItem) => (item.exact ? pathname === item.href : pathname.startsWith(item.href));

  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        {t("skipToContent")}
      </a>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-4 border-r bg-card/70 p-4 backdrop-blur md:flex">
        <div className="flex items-center justify-between">
          <Link href="/app" className="flex items-center gap-2.5 px-1 font-display text-lg font-semibold">
            <LogoMark /> {t("brand")}
          </Link>
          <ThemeToggle />
        </div>
        {me.trees.length > 0 ? <TreeSwitcher trees={me.trees} currentId={treeId} /> : null}
        {treeId ? <PersonSearch treeId={treeId} /> : null}
        <nav aria-label={t("mainNav")} className="flex flex-col gap-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item) ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                isActive(item) && "bg-secondary text-foreground",
              )}
            >
              <item.icon className="size-4" aria-hidden /> {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto">
          <UserMenu user={me.user} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b bg-background/90 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur md:hidden">
          <Link href="/app" aria-label={t("brand")} className="-m-1 flex size-9 items-center justify-center rounded-lg">
            <LogoMark className="size-7" />
          </Link>
          <div className="min-w-0 flex-1">{me.trees.length > 0 ? <TreeSwitcher trees={me.trees} currentId={treeId} /> : null}</div>
          {treeId ? <PersonSearch treeId={treeId} compact /> : null}
          <ThemeToggle />
          <UserMenu user={me.user} compact />
        </header>

        <main id="main" className={cn("flex min-h-0 flex-1 flex-col", treeId && "pb-16 md:pb-0")}>
          {children}
        </main>

        {/* Mobile bottom tabs */}
        {treeId ? (
          <nav aria-label={t("mainNav")} className="pb-safe fixed inset-x-0 bottom-0 z-30 grid auto-cols-fr grid-flow-col border-t bg-background/95 backdrop-blur md:hidden">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item) ? "page" : undefined}
                className={cn(
                  "flex min-w-0 flex-col items-center gap-0.5 px-0.5 py-2 text-[11px] font-medium text-muted-foreground",
                  isActive(item) && "text-primary",
                )}
              >
                <item.icon className="size-5" aria-hidden />
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            ))}
          </nav>
        ) : null}
      </div>
    </div>
  );
}
