import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/fraunces";
import "./app.css";

import * as Sentry from "@sentry/react";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from "react-router-dom";
import { useDownloadToasts } from "@/components/native/download-toasts";
import { Providers } from "@/components/providers/providers";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { IntlRoot } from "./intl";
import * as A from "./pages/app";
import * as Auth from "./pages/auth";
import { ErrorScreen, NotFound, RequireSession } from "./pages/common";
import { persistOptions, queryClient } from "./query-client";
import { initSentry } from "./sentry";

initSentry();

/** Every screen: theme and native glue (apps/frontend providers.tsx), toasts and tooltips (app-providers.tsx). */
function Root() {
  useDownloadToasts();
  // The splash in index.html stays until the first screen is drawn.
  useEffect(() => document.getElementById("splash")?.remove(), []);
  return (
    <Providers>
      <TooltipProvider delayDuration={300}>
        <Outlet />
        <Toaster position="top-center" richColors closeButton mobileOffset={{ top: "calc(env(safe-area-inset-top) + 12px)" }} />
      </TooltipProvider>
    </Providers>
  );
}

// The website's paths without the language prefix (the app has no public pages: src-tauri opens those outside).
const router = Sentry.wrapCreateBrowserRouterV7(createBrowserRouter)([
  {
    element: <Root />,
    errorElement: <ErrorScreen />,
    children: [
      { path: "/", element: <Navigate to="/app" replace /> },
      { path: "/welcome", element: <Auth.Welcome /> },
      { path: "/auth/google/complete", element: <Auth.AuthComplete /> },
      { path: "/auth/apple/complete", element: <Auth.AuthComplete /> },
      {
        element: <Auth.AuthLayout />,
        children: [
          { path: "/auth/login", element: <Auth.Login /> },
          { path: "/auth/signup", element: <Auth.Signup /> },
          { path: "/auth/forgot-password", element: <Auth.ForgotPassword /> },
          { path: "/auth/reset-password", element: <Auth.ResetPassword /> },
          { path: "/auth/verify-email", element: <Auth.VerifyEmailPage /> },
          { path: "/invite", element: <Auth.Invite /> },
        ],
      },
      {
        path: "/app",
        element: (
          <RequireSession>
            <A.AppLayout />
          </RequireSession>
        ),
        children: [
          { index: true, element: <A.AppHome /> },
          { path: "onboarding", element: <A.OnboardingPage /> },
          { path: "account", element: <A.AccountPage /> },
          {
            path: "t/:treeId",
            element: <A.TreeLayout />,
            children: [
              { index: true, element: <A.TreePage /> },
              { path: "ask", element: <A.AskPage /> },
              { path: "families", element: <A.FamiliesPage /> },
              { path: "members", element: <A.MembersPage /> },
              { path: "people", element: <A.PeoplePage /> },
              { path: "settings", element: <A.SettingsPage /> },
              { path: "offline", element: <A.TreeOfflinePage /> },
            ],
          },
        ],
      },
      {
        path: "/admin",
        element: (
          <RequireSession>
            <A.AdminLayout />
          </RequireSession>
        ),
      },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <IntlRoot>
        <Sentry.ErrorBoundary fallback={<ErrorScreen />}>
          <RouterProvider router={router} />
        </Sentry.ErrorBoundary>
      </IntlRoot>
    </PersistQueryClientProvider>
  </StrictMode>,
);
