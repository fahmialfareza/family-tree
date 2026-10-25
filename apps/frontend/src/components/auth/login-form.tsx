"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Field, FormError, PasswordInput } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, api, errorMessage, sessionRequest } from "@/lib/api/client";
import { type AuthProviders, SocialSignIn } from "./social-sign-in";

export function LoginForm({ next, providers, initialError }: { next: string; providers: AuthProviders; initialError?: string }) {
  const t = useTranslations("auth");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [unverified, setUnverified] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setUnverified(false);
    try {
      await sessionRequest("login", { identifier, password });
      window.location.assign(next);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setUnverified(true);
      setError(err instanceof ApiError && err.status === 401 ? t("invalidCredentials") : errorMessage(err));
      setBusy(false);
    }
  }

  async function resend() {
    try {
      await api.post("/api/auth/resend-verification", { email: identifier });
      toast.success(t("verificationResent"));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="space-y-5">
      <SocialSignIn next={next} providers={providers} />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormError message={error} />
        {unverified && identifier.includes("@") ? (
          <Button type="button" variant="secondary" size="sm" onClick={resend}>
            {t("resendVerification")}
          </Button>
        ) : null}
        <Field label={t("emailOrUsername")} required>
          {(p) => (
            <Input {...p} value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required autoFocus />
          )}
        </Field>
        <Field label={t("password")} required>
          {(p) => (
            <PasswordInput {...p} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          )}
        </Field>
        <div className="flex justify-end">
          <Link href="/auth/forgot-password" className="text-sm text-primary underline-offset-4 hover:underline">
            {t("forgotPassword")}
          </Link>
        </div>
        <Button type="submit" className="w-full" disabled={busy || !identifier || !password}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {t("signIn")}
        </Button>
      </form>
    </div>
  );
}
