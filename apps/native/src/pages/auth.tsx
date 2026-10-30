import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { Navigate, Outlet, useNavigate, useSearchParams } from "react-router-dom";
import { AcceptInvite } from "@/components/auth/accept-invite";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { ForgotPasswordForm, ResetPasswordForm } from "@/components/auth/password-reset";
import { SignupForm } from "@/components/auth/signup-form";
import { VerifyEmail } from "@/components/auth/verify-email";
import { Logo } from "@/components/common/logo";
import { PreferencesMenu, ThemeToggle } from "@/components/common/preferences";
import { WelcomeSlides } from "@/components/native/welcome-slides";
import { Button } from "@/components/ui/button";
import { exchangeSignInCode } from "@/lib/api/client";
import type { InvitePreview } from "@/lib/api/types";
import { BINDING_KEY } from "@/lib/native";
import { safeNext } from "@/lib/safe-next";
import { API_URL } from "../env";
import { hasSession } from "../native/session";
import { useAuthProviders, useTitle } from "./common";

// The website's sign-in pages (apps/frontend app/[locale]/(auth), (native)/welcome), with what their server did
// (redirect when signed in, the sign-in providers, the invite preview) done here.

export function AuthLayout() {
  const t = useTranslations("meta");
  return (
    <div className="relative flex min-h-dvh flex-col bg-[radial-gradient(ellipse_at_top,var(--color-secondary),transparent_60%)]">
      <header className="flex items-center justify-between px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8">
        <Logo label={t("brand")} href="/welcome" />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <PreferencesMenu />
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:items-center sm:pt-0">
        <div className="w-full max-w-md">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

/** First screen for signed-out users. */
export function Welcome() {
  const t = useTranslations("welcome");
  const tm = useTranslations("meta");
  const [params] = useSearchParams();
  const target = safeNext(params.get("next"), "/app");
  if (hasSession()) return <Navigate to={target} replace />;
  const next = encodeURIComponent(target);
  const slides = (["tree", "family", "ask"] as const).map((icon, i) => ({
    icon,
    title: t(`s${i + 1}Title`),
    body: t(`s${i + 1}Body`),
    label: t("slide", { n: i + 1, total: 3 }),
  }));
  return (
    <div className="flex min-h-dvh flex-col bg-[radial-gradient(ellipse_at_top,var(--color-secondary),transparent_65%)]">
      <header className="flex items-center justify-between px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8">
        <Logo label={tm("brand")} href="/welcome" />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <PreferencesMenu />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center py-6">
        <h1 className="sr-only">{t("title")}</h1>
        <WelcomeSlides slides={slides} label={t("slides")} />
      </main>
      <footer className="mx-auto w-full max-w-sm space-y-3 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2">
        <Button asChild size="lg" className="h-12 w-full text-base">
          <Link href={`/auth/signup?next=${next}`}>{t("signUp")}</Link>
        </Button>
        <Button asChild size="lg" variant="ghost" className="h-12 w-full text-base">
          <Link href={`/auth/login?next=${next}`}>{t("signIn")}</Link>
        </Button>
        <p className="text-center text-xs text-muted-foreground">{t("footnote")}</p>
      </footer>
    </div>
  );
}

export function Login() {
  const t = useTranslations("auth");
  const [params] = useSearchParams();
  const providers = useAuthProviders();
  useTitle(t("signIn"));
  const target = safeNext(params.get("next"), "/app");
  if (hasSession()) return <Navigate to={target} replace />;
  const error = params.get("error");
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
      <LoginForm next={target} providers={providers} initialError={errorText} />
    </AuthCard>
  );
}

export function Signup() {
  const t = useTranslations("auth");
  const [params] = useSearchParams();
  const providers = useAuthProviders();
  useTitle(t("createAccount"));
  const target = safeNext(params.get("next"), "/app");
  if (hasSession()) return <Navigate to={target} replace />;
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
      <SignupForm next={target} providers={providers} />
    </AuthCard>
  );
}

export function ForgotPassword() {
  const t = useTranslations("auth");
  useTitle(t("forgotTitle"));
  return (
    <AuthCard
      title={t("forgotTitle")}
      description={t("forgotIntro")}
      footer={
        <Link href="/auth/login" className="font-medium text-primary underline-offset-4 hover:underline">
          {t("backToSignIn")}
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}

export function ResetPassword() {
  const t = useTranslations("auth");
  const [params] = useSearchParams();
  useTitle(t("resetTitle"));
  return (
    <AuthCard title={t("resetTitle")}>
      <ResetPasswordForm token={params.get("token") ?? ""} />
    </AuthCard>
  );
}

export function VerifyEmailPage() {
  const t = useTranslations("auth");
  const [params] = useSearchParams();
  useTitle(t("verifyTitle"));
  return (
    <AuthCard title={t("verifyTitle")}>
      <VerifyEmail token={params.get("token") ?? ""} />
    </AuthCard>
  );
}

/** null: the token is not a live invite (expired, used, revoked or made up). */
async function loadPreview(token: string): Promise<InvitePreview | null> {
  try {
    const res = await fetch(`${API_URL}/api/invites/preview?token=${encodeURIComponent(token)}`, { cache: "no-store" });
    if (!res.ok) return null;
    return ((await res.json()) as { data: InvitePreview }).data;
  } catch {
    return null;
  }
}

export function Invite() {
  const t = useTranslations("invite");
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  useTitle(t("title"));
  const preview = useQuery({ queryKey: ["invite-preview", token], queryFn: () => loadPreview(token), enabled: !!token });
  return (
    <AuthCard title={t("title")}>
      {token && preview.isPending ? (
        <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" aria-hidden />
      ) : (
        <AcceptInvite token={token} signedIn={hasSession()} preview={preview.data ?? null} />
      )}
    </AuthCard>
  );
}

/**
 * The system browser hands a sign-in back here (deep link .../auth/<provider>/complete?code=&next=, opened by
 * src-tauri): the code is exchanged with this app's binding (apps/frontend app/[locale]/(auth)/auth/google/complete).
 */
export function AuthComplete() {
  const t = useTranslations("native");
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const code = params.get("code");
    const next = safeNext(params.get("next"), "/app");
    const binding = localStorage.getItem(BINDING_KEY);
    localStorage.removeItem(BINDING_KEY);
    if (!code || !binding) {
      navigate("/auth/login?error=google_state", { replace: true });
      return;
    }
    exchangeSignInCode(code, binding).then(
      // A whole new start: nothing of the signed-out screens stays.
      () => window.location.replace(next === "/" ? "/app" : next),
      () => navigate("/auth/login?error=google_exchange", { replace: true }),
    );
  }, [params, navigate]);
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4" role="status">
      <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
      <p className="text-muted-foreground">{t("signingIn")}</p>
    </div>
  );
}
