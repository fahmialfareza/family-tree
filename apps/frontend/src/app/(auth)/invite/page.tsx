import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import { AcceptInvite } from "@/components/auth/accept-invite";
import { getAccessToken } from "@/lib/server/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("invite");
  return { title: t("title"), robots: { index: false } };
}

export default async function InvitePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { token } = await searchParams;
  const t = await getTranslations("invite");
  return (
    <AuthCard title={t("title")}>
      <AcceptInvite token={token ?? ""} signedIn={!!(await getAccessToken())} />
    </AuthCard>
  );
}
