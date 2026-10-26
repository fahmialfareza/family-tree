import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppScope } from "@/components/providers/app-scope";
import { AppShell } from "@/components/shell/app-shell";
import type { Me } from "@/lib/api/types";
import { BackendError, backendGet } from "@/lib/server/backend";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let me: Me;
  try {
    me = await backendGet<Me>("/api/me");
  } catch (err) {
    if (err instanceof BackendError && err.status === 401) redirect("/auth/login?next=/app");
    throw err;
  }
  return (
    <AppScope>
      <AppShell initialMe={me}>{children}</AppShell>
    </AppScope>
  );
}
