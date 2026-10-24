import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const isDev = process.env.NODE_ENV !== "production";

// Images are plain <img> tags (photos come from Cloudinary); list extra hosts in NEXT_PUBLIC_IMAGE_HOSTS.
const imageHosts = ["https://res.cloudinary.com", ...(process.env.NEXT_PUBLIC_IMAGE_HOSTS ?? "").split(",")]
  .map((h) => h.trim())
  .filter(Boolean)
  .join(" ");

// The browser only talks to this origin (API calls go through /api/proxy), so connect-src stays 'self'.
// 'unsafe-inline' scripts are needed for Next.js bootstrapping without nonces; React Flow needs inline styles.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${imageHosts}`,
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: http://localhost:*" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Old single-family URLs now live inside the app shell.
  async redirects() {
    return [
      { source: "/person/:path*", destination: "/app", permanent: false },
      { source: "/person", destination: "/app", permanent: false },
      { source: "/family", destination: "/app", permanent: false },
      { source: "/relationship/:path*", destination: "/app", permanent: false },
      { source: "/tree/:id", destination: "/app?focus=:id", permanent: false },
    ];
  },
};

export default withNextIntl(nextConfig);
