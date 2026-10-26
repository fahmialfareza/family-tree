"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { DownloadToasts } from "@/components/native/download-toasts";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError } from "@/lib/api/client";

// A separate client module from providers.tsx: client modules ship whole, so these stay off the marketing pages.
/** The app, sign-in and admin sections (see app-scope.tsx): data fetching, tooltips and toasts. */
export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        {children}
        <Toaster position="top-center" richColors closeButton mobileOffset={{ top: "calc(env(safe-area-inset-top) + 12px)" }} />
        <DownloadToasts />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
