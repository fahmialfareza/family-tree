import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import { SignupForm } from "@/components/auth/signup-form";
import { safeNext } from "@/lib/safe-next";
import { authProviders, redirectIfSignedIn } from "@/lib/server/auth-redirect";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("createAccount") };
}

export default async function SignupPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { next } = await searchParams;
  await redirectIfSignedIn(next);
  const t = await getTranslations("auth");
  const target = safeNext(next, "/app");
  return (
    <AuthCard
      title={t("signupTitle")}
      description={t("signupIntro")}
      footer={
        <>
          {t("haveAccount")}{" "}
          <Link href={`/auth/login?next=${encodeURIComponent(target)}`} className="font-medium text-primary underline-offset-4 hover:underline">
            {t("signIn")}
          </Link>
        </>
      }
    >
      <SignupForm next={target} providers={await authProviders()} />
    </AuthCard>
  );
}
