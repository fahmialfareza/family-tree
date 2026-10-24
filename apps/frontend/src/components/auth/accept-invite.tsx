"use client";

import { Loader2, Users } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FormError } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api/client";
import type { Tree } from "@/lib/api/types";

export function AcceptInvite({ token, signedIn }: { token: string; signedIn: boolean }) {
  const t = useTranslations("invite");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(token ? null : t("invalid"));
  const here = `/invite?token=${encodeURIComponent(token)}`;

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const tree = await api.post<Tree>("/api/invites/accept", { token });
      window.location.assign(`/app/t/${tree._id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-secondary text-primary">
        <Users className="size-7" aria-hidden />
      </div>
      <p className="text-sm text-muted-foreground">{t("body")}</p>
      <FormError message={error} />
      {signedIn ? (
        <Button className="w-full" onClick={accept} disabled={busy || !token}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {t("accept")}
        </Button>
      ) : (
        <div className="grid gap-2">
          <Button asChild>
            <Link href={`/auth/signup?next=${encodeURIComponent(here)}`}>{t("createAccount")}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/auth/login?next=${encodeURIComponent(here)}`}>{t("signIn")}</Link>
          </Button>
          <p className="text-xs text-muted-foreground">{t("emailHint")}</p>
        </div>
      )}
    </div>
  );
}
