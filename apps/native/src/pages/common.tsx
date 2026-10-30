import { useQuery } from "@tanstack/react-query";
import { RotateCcw, TreePine, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { AuthProviders } from "@/components/auth/social-sign-in";
import { api } from "@/lib/api/client";
import { hasSession } from "../native/session";

/** The website's not-found page (apps/frontend app/[locale]/not-found.tsx). */
export function NotFound() {
  const t = useTranslations("errors");
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

/** The website's error page (apps/frontend app/[locale]/error.tsx), without its reload-once (the app is local). */
export function ErrorScreen({ retry = () => window.location.reload() }: { retry?: () => void }) {
  const t = useTranslations("errors");
  return (
    <main className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 px-6 text-center">
      <TriangleAlert className="size-12 text-terracotta" aria-hidden />
      <h1 className="font-display text-2xl font-semibold">{t("errorTitle")}</h1>
      <p className="max-w-md text-muted-foreground">{t("errorBody")}</p>
      <div className="flex gap-2">
        <Button onClick={retry}>
          <RotateCcw className="size-4" aria-hidden /> {t("retry")}
        </Button>
        <Button asChild variant="outline">
          <a href="/app">{t("goHome")}</a>
        </Button>
      </div>
    </main>
  );
}

/** Signed-out users go to the welcome screen (the website's middleware does this for the apps). */
export function RequireSession({ children }: { children: React.ReactNode }) {
  const { pathname, search } = useLocation();
  if (!hasSession()) return <Navigate to={`/welcome?next=${encodeURIComponent(pathname + search)}`} replace />;
  return children;
}

/** Which social sign-ins the API offers (apps/frontend lib/server/auth-redirect.ts authProviders). */
export function useAuthProviders(): AuthProviders {
  const { data } = useQuery({
    queryKey: ["auth-providers"],
    queryFn: () => api.get<Partial<AuthProviders>>("/api/auth/providers"),
    staleTime: 5 * 60_000,
  });
  return { google: !!data?.google, apple: !!data?.apple, appleWeb: !!data?.appleWeb };
}

/** Sets the window title like the website's page metadata. */
export function useTitle(title: string | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · Sakdulur` : "Sakdulur";
  }, [title]);
}
