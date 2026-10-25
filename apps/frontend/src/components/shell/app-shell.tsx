"use client";

import { Ellipsis, Network, Settings, Sparkles, UserRound, Users, UsersRound } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { LogoMark } from "@/components/common/logo";
import { ThemeToggle } from "@/components/common/preferences";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useMe } from "@/lib/api/hooks";
import type { Me } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { PersonSearch } from "./search";
import { TreeSwitcher } from "./tree-switcher";
import { UserMenu } from "./user-menu";

type NavItem = { href: string; label: string; icon: typeof Network; exact?: boolean };

const MAX_TABS = 5;

const tabClass = (active: boolean) =>
  cn("flex min-w-0 flex-col items-center gap-0.5 px-0.5 py-2 text-[11px] font-medium text-muted-foreground", active && "text-primary");

export function AppShell({ initialMe, children }: { initialMe: Me; children: React.ReactNode }) {
  const t = useTranslations("shell");
  const params = useParams<{ treeId?: string }>();
  const pathname = usePathname();
  const { data: me = initialMe } = useMe(initialMe);
  const treeId = params.treeId;
  const tree = me.trees.find((x) => x._id === treeId);
  // Members see the assistant once an owner turned it on; owners also see it while off, to find the switch.
  const showAssistant = !!tree?.assistantAvailable && (!!tree.assistantEnabled || tree.role === "owner");

  const nav: NavItem[] = treeId
    ? [
        { href: `/app/t/${treeId}`, label: t("tree"), icon: Network, exact: true },
        { href: `/app/t/${treeId}/people`, label: t("people"), icon: UsersRound },
        ...(showAssistant ? [{ href: `/app/t/${treeId}/ask`, label: t("ask"), icon: Sparkles }] : []),
        { href: `/app/t/${treeId}/families`, label: t("families"), icon: Users },
        { href: `/app/t/${treeId}/members`, label: t("members"), icon: UserRound },
        ...(tree?.role === "owner" ? [{ href: `/app/t/${treeId}/settings`, label: t("settings"), icon: Settings }] : []),
      ]
    : [];
  const [moreOpen, setMoreOpen] = useState(false);
  const tabs = nav.length > MAX_TABS ? nav.slice(0, MAX_TABS - 1) : nav;
  const overflow = nav.slice(tabs.length);
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
        {/* Mobile top bar: brand, tree, search, account (theme and language live in the account menu). */}
        <header className="sticky top-0 z-30 flex items-center gap-1.5 border-b bg-background/90 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur md:hidden">
          <Link href="/app" aria-label={t("brand")} className="-m-1 flex size-9 shrink-0 items-center justify-center rounded-lg">
            <LogoMark className="size-7" />
          </Link>
          <div className="min-w-0 flex-1">{me.trees.length > 0 ? <TreeSwitcher trees={me.trees} currentId={treeId} compact /> : null}</div>
          {treeId ? <PersonSearch treeId={treeId} compact /> : null}
          <UserMenu user={me.user} compact className="p-1" />
        </header>

        <main id="main" className={cn("flex min-h-0 flex-1 flex-col", treeId && "pb-16 md:pb-0")}>
          {children}
        </main>

        {/* Mobile bottom tabs: up to five; beyond that the last tab opens "More". */}
        {treeId ? (
          <nav aria-label={t("mainNav")} className="pb-safe fixed inset-x-0 bottom-0 z-30 grid auto-cols-fr grid-flow-col border-t bg-background/95 backdrop-blur md:hidden">
            {tabs.map((item) => (
              <Link key={item.href} href={item.href} aria-current={isActive(item) ? "page" : undefined} className={tabClass(isActive(item))}>
                <item.icon className="size-5" aria-hidden />
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            ))}
            {overflow.length ? (
              <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
                <SheetTrigger className={tabClass(overflow.some(isActive))} aria-current={overflow.some(isActive) ? "page" : undefined}>
                  <Ellipsis className="size-5" aria-hidden />
                  <span className="max-w-full truncate">{t("more")}</span>
                </SheetTrigger>
                <SheetContent side="bottom" className="rounded-t-2xl px-3 pt-2">
                  <SheetHeader className="px-2 pb-0">
                    <SheetTitle>{t("more")}</SheetTitle>
                  </SheetHeader>
                  <div className="flex flex-col gap-1 pb-3">
                    {overflow.map((item) => (
                      <SheetClose asChild key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={isActive(item) ? "page" : undefined}
                          className={cn(
                            "flex h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-medium hover:bg-accent",
                            isActive(item) && "bg-secondary text-primary",
                          )}
                        >
                          <item.icon className="size-5" aria-hidden /> {item.label}
                        </Link>
                      </SheetClose>
                    ))}
                  </div>
                </SheetContent>
              </Sheet>
            ) : null}
          </nav>
        ) : null}
      </div>
    </div>
  );
}
