/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The Go API (apps/backend-go), e.g. https://api.sakdulur.com. */
  readonly VITE_API_URL?: string;
  /** The public website, for links people share (invites) and the public pages (default https://sakdulur.com). */
  readonly VITE_SITE_URL?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_ENVIRONMENT?: string;
}

/** sakdulur-app@<version>, the Sentry release (vite.config.ts). */
declare const __APP_RELEASE__: string;

// apps/frontend code reads a few process.env values; vite.config.ts `define` replaces them.
declare const process: { env: Record<string, string | undefined> };
