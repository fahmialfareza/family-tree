// Android App Links + shared sign-in credentials for the app (apps/mobile). ANDROID_CERT_SHA256 lists the
// SHA-256 fingerprints of the signing certificates (Play App Signing key, and the upload key if wanted),
// comma-separated; without it this file is not served.

export const dynamic = "force-dynamic";

export function GET() {
  const fingerprints = (process.env.ANDROID_CERT_SHA256 ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (!fingerprints.length) return new Response("Not found", { status: 404 });
  return Response.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls", "delegate_permission/common.get_login_creds"],
        target: {
          namespace: "android_app",
          package_name: process.env.ANDROID_APP_PACKAGE || "com.malanghub.familytree",
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ],
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
