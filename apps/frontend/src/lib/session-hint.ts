/**
 * A readable "signed in" hint next to the httpOnly session cookies (lib/server/session.ts, middleware.ts).
 * It holds no secret; it only lets prerendered pages (the marketing site) show "Open app" instead of "Sign in".
 */
export const SIGNED_IN_COOKIE = "ft_signed_in";
