// iOS universal links + password autofill for the app (apps/native). IOS_APP_IDS lists "<TeamID>.<bundle id>"
// values, comma-separated; without it this file is not served. The app needs the matching Associated Domains
// (applinks:<domain>, webcredentials:<domain>).

export const dynamic = "force-dynamic";

// Links in emails and shared invites that should open in the app when it is installed.
const APP_PATHS = ["/invite*", "/auth/verify-email*", "/auth/reset-password*", "/app*"];

export function GET() {
  const appIDs = (process.env.IOS_APP_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!appIDs.length) return new Response("Not found", { status: 404 });
  return Response.json(
    {
      applinks: { details: [{ appIDs, components: APP_PATHS.map((path) => ({ "/": path })) }] },
      webcredentials: { apps: appIDs },
    },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
