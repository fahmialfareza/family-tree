"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useDownloadToasts } from "@/components/native/download-toasts";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError, isOfflineError } from "@/lib/api/client";
import { registerServiceWorker } from "@/lib/offline";

// A separate client module from providers.tsx: client modules ship whole, so these stay off the marketing pages.
/** The app, sign-in and admin sections (see app-scope.tsx): data fetching, tooltips and toasts. */
export function AppProviders({ children }: { children: React.ReactNode }) {
  useDownloadToasts();
  useEffect(registerServiceWorker, []);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // Data opened in this session stays at hand when the connection drops (the service worker keeps it
            // across restarts).
            gcTime: 24 * 60 * 60_000,
            refetchOnWindowFocus: false,
            retry: (count, error) => !isOfflineError(error) && !(error instanceof ApiError && error.status < 500) && count < 2,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        {children}
        <Toaster position="top-center" richColors closeButton mobileOffset={{ top: "calc(env(safe-area-inset-top) + 12px)" }} />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
