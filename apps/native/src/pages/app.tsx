import * as Sentry from "@sentry/react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Suspense, useEffect } from "react";
import { Navigate, Outlet, useParams, useSearchParams } from "react-router-dom";
import { AdminOverview } from "@/components/admin/admin-overview";
import { Logo } from "@/components/common/logo";
import { ThemeToggle } from "@/components/common/preferences";
import { Onboarding } from "@/components/onboarding/onboarding";
import { Account } from "@/components/pages/account";
import { Assistant } from "@/components/pages/assistant";
import { FamiliesList } from "@/components/pages/families-list";
import { Members } from "@/components/pages/members";
import { OfflinePage } from "@/components/pages/offline-page";
import { PeopleList } from "@/components/pages/people-list";
import { TreeSettings } from "@/components/pages/tree-settings";
import { AppShell } from "@/components/shell/app-shell";
import { UserMenu } from "@/components/shell/user-menu";
import { TreeCanvasClient } from "@/components/tree-canvas/tree-canvas-client";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { useMe, useTree } from "@/lib/api/hooks";
import type { Me } from "@/lib/api/types";
import Loading from "@/app/[locale]/(app)/app/loading";
import { ErrorScreen, NotFound, useTitle } from "./common";

// The website's app and admin sections (apps/frontend app/[locale]/(app), (admin)); what their layouts loaded on
// the server (the account, the tree, the admin check) is loaded here.

function useAccount(): { me?: Me; screen?: React.ReactNode } {
  const { data: me, error, refetch } = useMe();
  useEffect(() => {
    if (me) Sentry.setUser({ id: me.user._id });
  }, [me]);
  if (me) return { me };
  // A 401 already went back to the welcome screen (native/api-client.ts).
  if (error) return { screen: <ErrorScreen retry={() => void refetch()} /> };
  return { screen: <Loading /> };
}

export function AppLayout() {
  const { me, screen } = useAccount();
  if (!me) return screen;
  return (
    <AppShell initialMe={me}>
      <Outlet />
    </AppShell>
  );
}

/** /app: the first tree (keeping ?focus=) or onboarding. */
export function AppHome() {
  const { data: me } = useMe();
  const [params] = useSearchParams();
  if (!me) return null;
  if (me.trees.length === 0) return <Navigate to="/app/onboarding" replace />;
  const focus = params.get("focus");
  return <Navigate to={`/app/t/${me.trees[0]._id}${focus ? `?focus=${encodeURIComponent(focus)}` : ""}`} replace />;
}

export function OnboardingPage() {
  const t = useTranslations("onboarding");
  const { data: me } = useMe();
  const [params] = useSearchParams();
  useTitle(t("title"));
  if (!me) return null;
  if (me.trees.length > 0 && !params.get("new")) return <Navigate to={`/app/t/${me.trees[0]._id}`} replace />;
  return <Onboarding userName={me.user.name} isFirstTree={me.trees.length === 0} />;
}

export function AccountPage() {
  const t = useTranslations("account");
  useTitle(t("title"));
  return <Account />;
}

/** Non-members get the not-found page: the API answers 404 for trees you do not belong to. */
export function TreeLayout() {
  const { treeId = "" } = useParams();
  const tree = useTree(treeId);
  useTitle(tree.data?.name);
  if (tree.error instanceof ApiError && tree.error.status === 404) return <NotFound />;
  return <Outlet />;
}

function useTreeId() {
  return useParams().treeId ?? "";
}

export function TreePage() {
  const treeId = useTreeId();
  return (
    <Suspense>
      <TreeCanvasClient treeId={treeId} />
    </Suspense>
  );
}

/** A tree tab: its component with the tree id, titled like the website's page. */
function tab(Component: React.ComponentType<{ treeId: string }>, ns: "shell" | "offline", key: string) {
  return function TreeTab() {
    const treeId = useTreeId();
    const t = useTranslations(ns);
    useTitle(t(key));
    return <Component treeId={treeId} />;
  };
}

export const AskPage = tab(Assistant, "shell", "ask");
export const FamiliesPage = tab(FamiliesList, "shell", "families");
export const MembersPage = tab(Members, "shell", "members");
export const PeoplePage = tab(PeopleList, "shell", "people");
export const SettingsPage = tab(TreeSettings, "shell", "settings");
export const TreeOfflinePage = tab(OfflinePage, "offline", "pageTitle");

/** Platform admins only; everyone else gets the not-found page. */
export function AdminLayout() {
  const t = useTranslations("admin");
  const { me, screen } = useAccount();
  useTitle(t("title"));
  if (!me) return screen;
  if (me.user.role !== "admin") return <NotFound />;
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <Logo href="/admin" />
            <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">Admin</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href="/app">{t("openApp")}</Link>
            </Button>
            <ThemeToggle />
            <UserMenu user={me.user} compact className="p-1" />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <AdminOverview />
      </main>
    </div>
  );
}
