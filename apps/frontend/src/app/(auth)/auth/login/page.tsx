import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { safeNext } from "@/lib/safe-next";
import { authProviders, redirectIfSignedIn } from "@/lib/server/auth-redirect";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("signIn"), robots: { index: false } };
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { next, error } = await searchParams;
  await redirectIfSignedIn(next);
  const t = await getTranslations("auth");
  const target = safeNext(next, "/app");
  const errorText = error ? (t.has(`errors.${error}`) ? t(`errors.${error}`) : t("errors.generic")) : undefined;
  return (
    <AuthCard
      title={t("welcomeBack")}
      description={t("signInIntro")}
      footer={
        <>
          {t("noAccount")}{" "}
          <Link href={`/auth/signup?next=${encodeURIComponent(target)}`} className="font-medium text-primary underline-offset-4 hover:underline">
            {t("createAccount")}
          </Link>
        </>
      }
    >
      <LoginForm next={target} providers={await authProviders()} initialError={errorText} />
    </AuthCard>
  );
}
