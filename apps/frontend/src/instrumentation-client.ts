import * as Sentry from "@sentry/nextjs";
import { CLIENT_COOKIE, isAppClient } from "@/lib/app-client";
import { SENTRY_DATA_COLLECTION, SENTRY_DSN, SENTRY_ENVIRONMENT, SENTRY_TRACES_SAMPLE_RATE, SENTRY_TUNNEL } from "@/lib/sentry";

// Runs on every page, so it stays small: Session Replay is added only in the app section (app-providers.tsx).
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: SENTRY_ENVIRONMENT,
    tunnel: SENTRY_TUNNEL,
    dataCollection: SENTRY_DATA_COLLECTION,
    tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1,
    integrations: [Sentry.consoleLoggingIntegration({ levels: ["warn", "error"] })],
  });
  // Versions of the desktop and mobile apps that show this site mark themselves with the client cookie.
  const client = document.cookie.match(new RegExp(`(?:^|;\\s*)${CLIENT_COOKIE}=([^;]+)`))?.[1];
  Sentry.setTag("platform", isAppClient(client) ? client : "web");
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
