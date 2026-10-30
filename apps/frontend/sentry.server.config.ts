import * as Sentry from "@sentry/nextjs";
import { SENTRY_DATA_COLLECTION, SENTRY_DSN, SENTRY_INITIAL_SCOPE, SENTRY_ENVIRONMENT, SENTRY_TRACES_SAMPLE_RATE } from "@/lib/sentry";

// Used by `next dev`. On Cloudflare the Worker entry (worker.ts) sets the SDK up and this only supplies the release.
Sentry.init({
  dsn: SENTRY_DSN,
  environment: SENTRY_ENVIRONMENT,
  dataCollection: SENTRY_DATA_COLLECTION,
  initialScope: SENTRY_INITIAL_SCOPE,
  tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
});
