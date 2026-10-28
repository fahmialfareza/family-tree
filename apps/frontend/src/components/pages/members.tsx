"use client";

import { Copy, Loader2, LogOut, MailPlus, Share2, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Field } from "@/components/common/field";
import { PageContainer, PageHeader, Section } from "@/components/common/page";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api/client";
import { useCreateInvite, useInvites, useMe, useMembers, useRemoveMember, useRevokeInvite, useUpdateMember } from "@/lib/api/hooks";
import type { TreeRole } from "@/lib/api/types";
import { initials } from "@/lib/format";
import { shareLink, useNativePlatform } from "@/lib/native";
import { useOnlineRole } from "@/lib/offline";
import { InviteLinks } from "./invite-links";

const ROLES: TreeRole[] = ["owner", "editor", "viewer"];

export function Members({ treeId }: { treeId: string }) {
  const t = useTranslations("members");
  const native = useNativePlatform() !== "web";
  const tr = useTranslations("roles");
  const tc = useTranslations("common");
  const format = useFormatter();
  const router = useRouter();
  const { data: me } = useMe();
  const role = useOnlineRole(me?.trees.find((x) => x._id === treeId)?.role ?? "viewer");
  const isOwner = role === "owner";
  const { data: members, isLoading } = useMembers(treeId);
  const { data: invites } = useInvites(treeId, isOwner);
  const updateMember = useUpdateMember(treeId);
  const removeMember = useRemoveMember(treeId);
  const createInvite = useCreateInvite(treeId);
  const revokeInvite = useRevokeInvite(treeId);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TreeRole>("editor");
  const [lastLink, setLastLink] = useState<string | null>(null);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await createInvite.mutateAsync({ email: email.trim(), role: inviteRole });
      setLastLink(`${window.location.origin}/invite?token=${encodeURIComponent(res.token)}`);
      setEmail("");
      toast.success(t("invited", { email: res.invite.email }));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <PageContainer>
      <PageHeader title={t("title")} description={t("description")} />

      {isOwner ? <InviteLinks treeId={treeId} /> : null}

      {isOwner ? (
        <Section title={t("inviteTitle")} description={t("inviteBody")}>
          <form onSubmit={invite} className="grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
            <Field label={t("email")} required>
              {(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" required />}
            </Field>
            <div className="space-y-1.5">
              <span className="text-sm font-medium">{t("role")}</span>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as TreeRole)}>
                <SelectTrigger className="w-full" aria-label={t("role")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {tr(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={!email.trim() || createInvite.isPending}>
              {createInvite.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <MailPlus className="size-4" aria-hidden />}
              {t("send")}
            </Button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">{t("rolesHelp")}</p>
          {lastLink ? (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-secondary p-2 pl-3 text-sm">
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{lastLink}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    if ((await shareLink({ url: lastLink, title: t("shareInvite") })) === "copied") toast.success(t("linkCopied"));
                  } catch {
                    // share sheet dismissed
                  }
                }}
              >
                {native ? <Share2 className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}{" "}
                {native ? t("shareLink") : t("copyLink")}
              </Button>
            </div>
          ) : null}
          {invites && invites.length > 0 ? (
            <div className="mt-5 space-y-2">
              <h3 className="text-sm font-semibold">{t("pending")}</h3>
              <ul className="divide-y rounded-xl border">
                {invites.map((inv) => (
                  <li key={inv._id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="min-w-0 flex-1 truncate">{inv.email}</span>
                    <Badge variant="secondary">{tr(inv.role)}</Badge>
                    <span className="hidden text-xs text-muted-foreground sm:inline">{t("expires", { date: format.dateTime(new Date(inv.expiresAt), { dateStyle: "medium" }) })}</span>
                    <Button variant="ghost" size="icon" className="size-8" onClick={() => revokeInvite.mutate(inv._id)} aria-label={t("revoke", { email: inv.email })}>
                      <X className="size-4" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Section>
      ) : null}

      <Section title={t("membersTitle")}>
        {isLoading ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : (
          <ul className="divide-y">
            {(members ?? []).map((m) => {
              const self = m.userId === me?.user._id;
              return (
                <li key={m.userId} className="flex flex-wrap items-center gap-3 py-3">
                  <Avatar className="size-9">
                    <AvatarFallback className="bg-secondary text-xs font-semibold">{initials(m.name)}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {m.name} {self ? <span className="text-muted-foreground">({t("you")})</span> : null}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{m.email || m.username}</span>
                  </span>
                  {isOwner && !self ? (
                    <Select
                      value={m.role}
                      onValueChange={async (v) => {
                        try {
                          await updateMember.mutateAsync({ userId: m.userId, role: v as TreeRole });
                          toast.success(t("roleChanged", { name: m.name }));
                        } catch (err) {
                          toast.error(errorMessage(err));
                        }
                      }}
                    >
                      <SelectTrigger className="h-8 w-32" aria-label={t("roleOf", { name: m.name })}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {tr(r)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="secondary">{tr(m.role)}</Badge>
                  )}
                  {isOwner && !self ? (
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="icon" className="size-8" aria-label={t("remove", { name: m.name })}>
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      }
                      title={t("remove", { name: m.name })}
                      description={t("removeBody")}
                      confirmLabel={tc("remove")}
                      onConfirm={async () => {
                        try {
                          await removeMember.mutateAsync(m.userId);
                          toast.success(t("removed"));
                        } catch (err) {
                          toast.error(errorMessage(err));
                        }
                      }}
                    />
                  ) : null}
                  {self ? (
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="sm">
                          <LogOut className="size-4" aria-hidden /> {t("leave")}
                        </Button>
                      }
                      title={t("leaveTitle")}
                      description={t("leaveBody")}
                      confirmLabel={t("leave")}
                      onConfirm={async () => {
                        try {
                          await removeMember.mutateAsync(m.userId);
                          router.push("/app");
                        } catch (err) {
                          toast.error(errorMessage(err));
                        }
                      }}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </PageContainer>
  );
}
