import { NextResponse } from "next/server";

// Frontend health: is the Worker configured, and can it reach the Go API (and how fast)? Reports only
// booleans, status codes and timings, never configuration values.
export const dynamic = "force-dynamic";

export async function GET() {
  const backendUrl = process.env.BACKEND_URL?.replace(/\/+$/, "");
  const config = {
    appUrl: !!process.env.NEXT_PUBLIC_APP_URL,
    backendUrl: !!backendUrl,
    backendPublicUrl: !!process.env.BACKEND_PUBLIC_URL,
    bffSecret: !!process.env.BFF_SHARED_SECRET,
  };
  let backend: { ok: boolean; status?: number; ms?: number; error?: string } = { ok: false, error: "BACKEND_URL is not set" };
  if (backendUrl) {
    const start = Date.now();
    try {
      const res = await fetch(`${backendUrl}/readyz`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
      backend = { ok: res.ok, status: res.status, ms: Date.now() - start };
    } catch (err) {
      backend = { ok: false, ms: Date.now() - start, error: err instanceof Error ? err.name : "fetch failed" };
    }
  }
  const ok = config.appUrl && backend.ok;
  return NextResponse.json({ ok, config, backend }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
