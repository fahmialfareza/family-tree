import type { init } from "@sentry/nextjs";

type DataCollection = NonNullable<NonNullable<Parameters<typeof init>[0]>["dataCollection"]>;

// Shared Sentry settings for the browser (instrumentation-client.ts) and `next dev` (sentry.*.config.ts). The Worker
// takes its own from worker.ts. Without NEXT_PUBLIC_SENTRY_DSN (local development, CI) nothing is sent.
export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || undefined;
export const SENTRY_ENVIRONMENT = process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV;
export const SENTRY_TRACES_SAMPLE_RATE = process.env.NODE_ENV === "production" ? 0.1 : 1;
// The website and the apps share one Sentry project: app:web here, app:native in apps/native (src/sentry.ts).
export const SENTRY_INITIAL_SCOPE = { tags: { app: "web" } };
// Browser events go through this site (app/api/monitoring/route.ts): no CSP entry, and ad blockers let it through.
export const SENTRY_TUNNEL = "/api/monitoring";
// Family trees are private: no user details, cookies, bodies or local variables, and only harmless headers.
export const SENTRY_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: { allow: ["accept-language", "content-type", "user-agent"] }, response: false },
  httpBodies: [],
  urlQueryParams: { deny: ["token", "code", "binding", "next"] },
  stackFrameVariables: false,
  genAI: { inputs: false, outputs: false },
} satisfies DataCollection;
