"use client";

import {
  BadgeCheck,
  Download,
  Laptop,
  Loader2,
  LogOut,
  Trash2,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Field, PasswordInput } from "@/components/common/field";
import { PageContainer, PageHeader, Section } from "@/components/common/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ApiError, api, errorMessage } from "@/lib/api/client";
import { useMe, useSessions, useUpdateMe } from "@/lib/api/hooks";
import { useQueryClient } from "@tanstack/react-query";

export function Account() {
  const t = useTranslations("account");
  const tc = useTranslations("common");
  const format = useFormatter();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: sessions } = useSessions();
  const updateMe = useUpdateMe();
  const [nameDraft, setName] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [blockingTrees, setBlockingTrees] = useState<
    { _id: string; name: string }[]
  >([]);

  if (!me) return null;
  const user = me.user;
  const name = nameDraft ?? user.name;

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title={t("title")} description={t("description")} />

      <Section title={t("profile")}>
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            run("name", async () => {
              await updateMe.mutateAsync(name.trim());
              toast.success(t("saved"));
            });
          }}
        >
          <Field label={t("name")} className="flex-1" required>
            {(p) => (
              <Input
                {...p}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                autoComplete="name"
                required
              />
            )}
          </Field>
          <Button
            type="submit"
            disabled={!name.trim() || name === user.name || busy === "name"}
          >
            {tc("save")}
          </Button>
        </form>
        {user.username ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {t("username", { username: user.username })}
          </p>
        ) : null}
      </Section>

      <Section
        title={t("email")}
        description={user.email ? undefined : t("addEmailHelp")}
      >
        {user.email ? (
          <p className="mb-4 flex items-center gap-2 text-sm">
            {user.email}
            {user.emailVerified ? (
              <Badge variant="secondary" className="gap-1">
                <BadgeCheck className="size-3.5 text-success" aria-hidden />{" "}
                {t("verified")}
              </Badge>
            ) : null}
            {user.googleLinked ? <Badge variant="outline">Google</Badge> : null}
          </p>
        ) : null}
        {pendingEmail ? (
          <p
            className="mb-4 rounded-lg bg-secondary px-3 py-2 text-sm"
            role="status"
          >
            {t("pendingEmail", { email: pendingEmail })}
          </p>
        ) : null}
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            run("email", async () => {
              const res = await api.put<{ pendingEmail: string | null }>(
                "/api/me/email",
                { email: email.trim(), password: emailPassword },
              );
              setPendingEmail(res.pendingEmail);
              setEmail("");
              setEmailPassword("");
            });
          }}
        >
          <Field
            label={user.email ? t("newEmail") : t("emailAddress")}
            required
          >
            {(p) => (
              <Input
                {...p}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            )}
          </Field>
          {user.hasPassword ? (
            <Field label={t("currentPassword")} required>
              {(p) => (
                <PasswordInput
                  {...p}
                  value={emailPassword}
                  onChange={(e) => setEmailPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              )}
            </Field>
          ) : null}
          <div className="sm:col-span-2">
            <Button
              type="submit"
              disabled={
                !email.trim() ||
                (user.hasPassword && !emailPassword) ||
                busy === "email"
              }
            >
              {busy === "email" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null}
              {t("sendVerification")}
            </Button>
          </div>
        </form>
      </Section>

      <Section
        title={user.hasPassword ? t("changePassword") : t("setPassword")}
      >
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            run("password", async () => {
              await api.post("/api/auth/change-password", {
                currentPassword,
                newPassword,
              });
              setCurrentPassword("");
              setNewPassword("");
              toast.success(t("passwordChanged"));
              qc.invalidateQueries({ queryKey: ["sessions"] });
            });
          }}
        >
          {user.hasPassword ? (
            <Field label={t("currentPassword")} required>
              {(p) => (
                <PasswordInput
                  {...p}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              )}
            </Field>
          ) : null}
          <Field label={t("newPassword")} hint={t("passwordRule")} required>
            {(p) => (
              <PasswordInput
                {...p}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={10}
              />
            )}
          </Field>
          <div className="sm:col-span-2">
            <Button
              type="submit"
              disabled={newPassword.length < 10 || busy === "password"}
            >
              {tc("save")}
            </Button>
          </div>
        </form>
      </Section>

      <Section title={t("sessions")} description={t("sessionsHelp")}>
        <ul className="divide-y">
          {(sessions ?? []).map((s) => (
            <li key={s._id} className="flex items-center gap-3 py-3 text-sm">
              <Laptop
                className="size-5 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate">
                  {s.userAgent || t("unknownDevice")}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {s.ip} ·{" "}
                  {t("lastActive", {
                    date: format.relativeTime(new Date(s.lastUsedAt)),
                  })}
                </span>
              </span>
              {s.current ? (
                <Badge variant="secondary">{t("thisDevice")}</Badge>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    run(`s-${s._id}`, async () => {
                      await api.delete(`/api/auth/sessions/${s._id}`);
                      qc.invalidateQueries({ queryKey: ["sessions"] });
                    })
                  }
                >
                  {t("signOutDevice")}
                </Button>
              )}
            </li>
          ))}
        </ul>
        <Button
          variant="outline"
          className="mt-3"
          onClick={() =>
            run("all", async () => {
              await api.post("/api/auth/logout-all");
              await fetch("/api/session/logout", { method: "POST" });
              window.location.assign("/auth/login");
            })
          }
        >
          <LogOut className="size-4" aria-hidden /> {t("signOutEverywhere")}
        </Button>
      </Section>

      <Section title={t("yourData")} description={t("yourDataHelp")}>
        <Button asChild variant="outline">
          <a href="/api/proxy/api/me/export" download="sakdulur-account.json">
            <Download className="size-4" aria-hidden /> {t("downloadData")}
          </a>
        </Button>
      </Section>

      <Section title={t("deleteAccount")} className="border-destructive/40">
        <p className="mb-4 text-sm text-muted-foreground">{t("deleteHelp")}</p>
        <Dialog onOpenChange={() => setBlockingTrees([])}>
          <DialogTrigger asChild>
            <Button variant="destructive">
              <Trash2 className="size-4" aria-hidden /> {t("deleteAccount")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("deleteTitle")}</DialogTitle>
              <DialogDescription>{t("deleteBody")}</DialogDescription>
            </DialogHeader>
            {blockingTrees.length ? (
              <div
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm"
              >
                {t("blockingTrees")}{" "}
                {blockingTrees.map((x) => x.name).join(", ")}
              </div>
            ) : null}
            {user.hasPassword ? (
              <Field label={t("currentPassword")} required>
                {(p) => (
                  <PasswordInput
                    {...p}
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    autoComplete="current-password"
                  />
                )}
              </Field>
            ) : null}
            <Field label={t("typeDelete")} required>
              {(p) => (
                <Input
                  {...p}
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  autoComplete="off"
                />
              )}
            </Field>
            <DialogFooter>
              <Button
                variant="destructive"
                disabled={
                  deleteConfirm !== "DELETE" ||
                  (user.hasPassword && !deletePassword) ||
                  busy === "delete"
                }
                onClick={() =>
                  run("delete", async () => {
                    try {
                      await api.delete("/api/me", {
                        confirm: "DELETE",
                        password: deletePassword,
                      });
                    } catch (err) {
                      if (err instanceof ApiError && err.status === 409) {
                        setBlockingTrees(
                          (
                            err.body as {
                              trees?: { _id: string; name: string }[];
                            }
                          )?.trees ?? [],
                        );
                        return;
                      }
                      throw err;
                    }
                    await fetch("/api/session/logout", { method: "POST" });
                    window.location.assign("/");
                  })
                }
              >
                {t("deleteForever")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Section>
    </PageContainer>
  );
}
