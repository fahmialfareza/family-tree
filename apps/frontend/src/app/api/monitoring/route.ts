import { createSentryTunnelRoute } from "@sentry/nextjs/tunnel";
import { SENTRY_DSN } from "@/lib/sentry";

// Forwards the browser's Sentry envelopes (SENTRY_TUNNEL) to Sentry, without cookies, and only for our own DSN.
export const { POST } = createSentryTunnelRoute({ allowedDsns: SENTRY_DSN ? [SENTRY_DSN] : [] });
