"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Field, FormError, PasswordInput } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { ApiError, errorMessage, sessionRequest } from "@/lib/api/client";

type State = "checking" | "needsPassword" | "needsSignIn" | "done" | "invalid";

// A verification link either completes a signup (needs the signup password, then signs in) or confirms
// an email change (needs to be signed in as that account). The first attempt without a password tells us which.
export function VerifyEmail({ token }: { token: string }) {
  const t = useTranslations("auth");
  const [state, setState] = useState<State>(token ? "checking" : "invalid");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const tried = useRef(false);

  useEffect(() => {
    if (!token || tried.current) return;
    tried.current = true;
    sessionRequest<{ verified: boolean; user?: unknown }>("verify-email", { token })
      .then((data) => {
        setSignedIn(!!data?.user);
        setState("done");
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setState("needsPassword");
        else if (err instanceof ApiError && err.status === 401) setState("needsSignIn");
        else {
          setError(errorMessage(err));
          setState("invalid");
        }
      });
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await sessionRequest<{ user?: unknown }>("verify-email", { token, password });
      setSignedIn(!!data?.user);
      setState("done");
    } catch (err) {
      setError(err instanceof ApiError && err.status === 403 ? t("wrongSignupPassword") : errorMessage(err));
      if (err instanceof ApiError && err.status === 410) setState("invalid");
    } finally {
      setBusy(false);
    }
  }

  if (state === "checking") {
    return (
      <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden /> {t("verifying")}
      </p>
    );
  }
  if (state === "done") {
    return (
      <div className="space-y-4 text-center" role="status">
        <CheckCircle2 className="mx-auto size-12 text-success" aria-hidden />
        <p className="font-medium">{t("emailVerified")}</p>
        <Button asChild className="w-full">
          <Link href={signedIn ? "/app" : "/app/account"}>{t("continue")}</Link>
        </Button>
      </div>
    );
  }
  if (state === "needsSignIn") {
    const here = `/auth/verify-email?token=${encodeURIComponent(token)}`;
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-muted-foreground">{t("signInToConfirmChange")}</p>
        <Button asChild className="w-full">
          <Link href={`/auth/login?next=${encodeURIComponent(here)}`}>{t("signIn")}</Link>
        </Button>
      </div>
    );
  }
  if (state === "invalid") {
    return (
      <div className="space-y-4 text-center">
        <FormError message={error ?? t("linkInvalid")} />
        <Button asChild variant="secondary" className="w-full">
          <Link href="/auth/login">{t("backToSignIn")}</Link>
        </Button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("confirmWithPassword")}</p>
      <FormError message={error} />
      <Field label={t("password")} required>
        {(p) => <PasswordInput {...p} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus required />}
      </Field>
      <Button type="submit" className="w-full" disabled={busy || !password}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {t("confirmEmail")}
      </Button>
    </form>
  );
}
