import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import { VerifyEmail } from "@/components/auth/verify-email";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("verifyTitle"), robots: { index: false } };
}

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { token } = await searchParams;
  const t = await getTranslations("auth");
  return (
    <AuthCard title={t("verifyTitle")}>
      <VerifyEmail token={token ?? ""} />
    </AuthCard>
  );
}
