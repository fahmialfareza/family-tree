"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Field, FormError, PasswordInput } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api/client";

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/auth/forgot-password", { email });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <p className="rounded-lg bg-secondary px-4 py-3 text-sm" role="status">
        {t("resetSent", { email })}
      </p>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <FormError message={error} />
      <Field label={t("email")} required>
        {(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required autoFocus />}
      </Field>
      <Button type="submit" className="w-full" disabled={busy || !email}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {t("sendResetLink")}
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations("auth");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(token ? null : t("linkInvalid"));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError(t("passwordsDontMatch"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/auth/reset-password", { token, password });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4 text-center" role="status">
        <CheckCircle2 className="mx-auto size-12 text-success" aria-hidden />
        <p className="font-medium">{t("passwordUpdated")}</p>
        <Button asChild className="w-full">
          <Link href="/auth/login">{t("signIn")}</Link>
        </Button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <FormError message={error} />
      <Field label={t("newPassword")} hint={t("passwordRule")} required>
        {(p) => <PasswordInput {...p} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required autoFocus />}
      </Field>
      <Field label={t("confirmPassword")} required>
        {(p) => <PasswordInput {...p} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />}
      </Field>
      <Button type="submit" className="w-full" disabled={busy || !token || !password}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {t("setNewPassword")}
      </Button>
    </form>
  );
}
