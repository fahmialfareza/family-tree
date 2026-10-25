"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { isUserCancel, signInWithAppleNative, startGoogleSignInNative, useNativePlatform } from "@/lib/native";
import { GoogleIcon } from "./auth-card";

export type AuthProviders = { google: boolean; apple: boolean };

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-current">
      <path d="M16.4 12.6c0-2.5 2-3.7 2.1-3.7-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.8.9-.8 0-2-.9-3.3-.8-1.7 0-3.3 1-4.2 2.5-1.8 3.1-.5 7.7 1.3 10.2.8 1.2 1.8 2.6 3.1 2.6 1.3-.1 1.7-.8 3.3-.8 1.5 0 2 .8 3.3.8 1.4 0 2.2-1.3 3-2.5 1-1.4 1.4-2.8 1.4-2.8 0 0-2.6-1-2.6-4.4zM14 5.2c.7-.8 1.2-2 1-3.2-1 0-2.2.7-3 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.3-.6 3-1.3z" />
    </svg>
  );
}

/**
 * Social sign-in buttons. On the website Google is a plain link through the BFF. In the mobile app Google
 * runs in the system browser and, on iOS, Sign in with Apple is offered too (an App Store requirement
 * whenever another social login is available).
 */
export function SocialSignIn({ next, providers }: { next: string; providers: AuthProviders }) {
  const t = useTranslations("auth");
  const platform = useNativePlatform();
  const [busy, setBusy] = useState<"google" | "apple" | null>(null);
  const showApple = providers.apple && platform === "ios";
  if (!providers.google && !showApple) return null;

  async function google() {
    setBusy("google");
    try {
      await startGoogleSignInNative(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errors.generic"));
    } finally {
      setBusy(null);
    }
  }

  async function apple() {
    setBusy("apple");
    try {
      await signInWithAppleNative();
      window.location.assign(next);
    } catch (err) {
      if (!isUserCancel(err)) toast.error(err instanceof Error ? err.message : t("errors.generic"));
      setBusy(null);
    }
  }

  return (
    <>
      <div className="space-y-2.5">
        {showApple ? (
          <Button type="button" className="w-full bg-foreground text-background hover:bg-foreground/90" onClick={apple} disabled={!!busy}>
            {busy === "apple" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <AppleIcon />} {t("continueWithApple")}
          </Button>
        ) : null}
        {providers.google ? (
          platform === "web" ? (
            <Button asChild variant="outline" className="w-full">
              <a href={`/api/session/google/start?next=${encodeURIComponent(next)}`}>
                <GoogleIcon /> {t("continueWithGoogle")}
              </a>
            </Button>
          ) : (
            <Button type="button" variant="outline" className="w-full" onClick={google} disabled={!!busy}>
              {busy === "google" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <GoogleIcon />} {t("continueWithGoogle")}
            </Button>
          )
        ) : null}
      </div>
      <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> {t("or")} <span className="h-px flex-1 bg-border" />
      </div>
    </>
  );
}
