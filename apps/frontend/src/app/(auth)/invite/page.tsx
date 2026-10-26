import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import { AcceptInvite } from "@/components/auth/accept-invite";
import type { InvitePreview } from "@/lib/api/types";
import { serverEnv } from "@/lib/server/env";
import { getAccessToken } from "@/lib/server/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("invite");
  return { title: t("title"), robots: { index: false } };
}

/** null: the token is not a live invite (expired, used, revoked or made up). */
async function loadPreview(token: string): Promise<InvitePreview | null> {
  if (!token) return null;
  try {
    const res = await fetch(`${serverEnv.backendUrl}/api/invites/preview?token=${encodeURIComponent(token)}`, { cache: "no-store" });
    if (!res.ok) return null;
    return ((await res.json()) as { data: InvitePreview }).data;
  } catch {
    return null;
  }
}

export default async function InvitePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { token = "" } = await searchParams;
  const t = await getTranslations("invite");
  return (
    <AuthCard title={t("title")}>
      <AcceptInvite token={token} signedIn={!!(await getAccessToken())} preview={await loadPreview(token)} />
    </AuthCard>
  );
}
