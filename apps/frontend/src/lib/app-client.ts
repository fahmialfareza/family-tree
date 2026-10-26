/**
 * The desktop and mobile apps (apps/native, Tauri) show this site. They open /app?client=<platform>, and
 * middleware.ts remembers that in CLIENT_COOKIE; app-only behavior keys off it (no landing page, a welcome
 * screen for signed-out users, native sign-in). Web visitors never have the cookie. Plain module: also used by
 * the edge middleware.
 */
export const CLIENT_COOKIE = "ft_client";
export const APP_CLIENTS = ["ios", "android", "macos", "windows", "linux"] as const;
export type AppClient = (typeof APP_CLIENTS)[number];

export function isAppClient(value: string | null | undefined): value is AppClient {
  return !!value && (APP_CLIENTS as readonly string[]).includes(value);
}
