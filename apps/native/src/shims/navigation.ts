import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useLocation, useNavigate, useParams as useRouterParams, useSearchParams as useRouterSearchParams } from "react-router-dom";

// next/navigation for the app (react-router). router.refresh() re-runs Server Components on the website; here the
// data lives in React Query, so it refetches that instead.

type NavigateOptions = { scroll?: boolean };

export function useRouter() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return useMemo(
    () => ({
      push: (href: string, opts?: NavigateOptions) => navigate(href, { preventScrollReset: opts?.scroll === false }),
      replace: (href: string, opts?: NavigateOptions) => navigate(href, { replace: true, preventScrollReset: opts?.scroll === false }),
      back: () => navigate(-1),
      forward: () => navigate(1),
      refresh: () => void queryClient.invalidateQueries(),
      prefetch: () => {},
    }),
    [navigate, queryClient],
  );
}

export function usePathname() {
  return useLocation().pathname;
}

export function useSearchParams(): URLSearchParams {
  return useRouterSearchParams()[0];
}

export function useParams<T extends Record<string, string | undefined> = Record<string, string | undefined>>(): T {
  return useRouterParams() as T;
}
