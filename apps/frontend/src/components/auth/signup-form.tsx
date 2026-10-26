"use client";

import { Loader2, MailCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Field, FormError, PasswordInput } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, errorMessage, sessionRequest } from "@/lib/api/client";
import { MIN_AGE } from "@/lib/legal-content";
import { type AuthProviders, SocialSignIn } from "./social-sign-in";

export function SignupForm({ next, providers }: { next: string; providers: AuthProviders }) {
  const t = useTranslations("auth");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 10) {
      setError(t("passwordRule"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await sessionRequest("signup", { name, email, password });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4 text-center" role="status">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-secondary text-primary">
          <MailCheck className="size-7" aria-hidden />
        </div>
        <h2 className="font-display text-xl font-semibold">{t("checkInbox")}</h2>
        <p className="text-sm text-muted-foreground">{t("checkInboxBody", { email })}</p>
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              await api.post("/api/auth/resend-verification", { email });
              toast.success(t("verificationResent"));
            } catch (err) {
              toast.error(errorMessage(err));
            }
          }}
        >
          {t("resendVerification")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SocialSignIn next={next} providers={providers} />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormError message={error} />
        <Field label={t("name")} required>
          {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required maxLength={120} autoFocus />}
        </Field>
        <Field label={t("email")} required>
          {(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />}
        </Field>
        <Field label={t("password")} hint={t("passwordRule")} required>
          {(p) => <PasswordInput {...p} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required minLength={10} />}
        </Field>
        <Button type="submit" className="w-full" disabled={busy || !name || !email || !password}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {t("createAccount")}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          {t.rich("agree", {
            age: MIN_AGE,
            terms: (c) => (
              <Link href="/terms" className="underline underline-offset-2">
                {c}
              </Link>
            ),
            privacy: (c) => (
              <Link href="/privacy" className="underline underline-offset-2">
                {c}
              </Link>
            ),
          })}
        </p>
      </form>
    </div>
  );
}
