import { NextRequest, NextResponse } from "next/server";
import { serverEnv } from "@/lib/server/env";

// Development photo storage: the API serves uploads at /uploads/* when Cloudinary is not configured.
// Forwarding keeps those relative URLs working from this origin. Production uses Cloudinary URLs.
export async function GET(_: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const res = await fetch(`${serverEnv.backendUrl}/uploads/${path.map(encodeURIComponent).join("/")}`, { cache: "no-store" });
  if (!res.ok) return new NextResponse(null, { status: res.status });
  return new NextResponse(res.body, {
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "application/octet-stream",
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
