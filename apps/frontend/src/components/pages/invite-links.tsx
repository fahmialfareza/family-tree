"use client";

import { Copy, Link2, Loader2, Share2, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Section } from "@/components/common/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { errorMessage } from "@/lib/api/client";
import { useCreateInviteLink, useInviteLinks, useRevokeInviteLink } from "@/lib/api/hooks";
import { SITE_URL } from "@/lib/brand";
import { shareLink, useNativePlatform } from "@/lib/native";

const DAYS = [1, 7, 30];

/** Owners: one shareable link many people can join with until it expires (or is turned off). */
export function InviteLinks({ treeId }: { treeId: string }) {
  const t = useTranslations("members");
  const tr = useTranslations("roles");
  const format = useFormatter();
  const native = useNativePlatform() !== "web";
  const { data: links } = useInviteLinks(treeId, true);
  const create = useCreateInviteLink(treeId);
  const revoke = useRevokeInviteLink(treeId);
  const [role, setRole] = useState<"editor" | "viewer">("viewer");
  const [days, setDays] = useState("7");
  const [fresh, setFresh] = useState<string | null>(null);

  async function share() {
    if (!fresh) return;
    try {
      if ((await shareLink({ url: fresh, title: t("shareInvite") })) === "copied") toast.success(t("linkCopied"));
    } catch {
      // share sheet dismissed
    }
  }

  return (
    <Section title={t("linkTitle")} description={t("linkBody")}>
      <form
        className="grid gap-3 sm:grid-cols-[10rem_10rem_auto] sm:items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const res = await create.mutateAsync({ role, days: Number(days) });
            setFresh(`${SITE_URL}/invite?token=${encodeURIComponent(res.token)}`);
            toast.success(t("linkCreated"));
          } catch (err) {
            toast.error(errorMessage(err));
          }
        }}
      >
        <div className="space-y-1.5">
          <span className="text-sm font-medium">{t("linkRole")}</span>
          <Select value={role} onValueChange={(v) => setRole(v as "editor" | "viewer")}>
            <SelectTrigger className="w-full" aria-label={t("linkRole")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="viewer">{tr("viewer")}</SelectItem>
              <SelectItem value="editor">{tr("editor")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <span className="text-sm font-medium">{t("linkExpiry")}</span>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-full" aria-label={t("linkExpiry")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAYS.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {t("days", { count: d })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Link2 className="size-4" aria-hidden />}
          {t("createLink")}
        </Button>
      </form>
      <p className="mt-3 text-xs text-muted-foreground">{t("linkRolesHelp")}</p>

      {fresh ? (
        <div className="mt-4 space-y-2 rounded-lg bg-secondary p-3">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-mono text-xs">{fresh}</span>
            <Button size="sm" variant="outline" onClick={share}>
              {native ? <Share2 className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {native ? t("shareLink") : t("copyLink")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("linkOnce")}</p>
        </div>
      ) : null}

      {links && links.length > 0 ? (
        <div className="mt-5 space-y-2">
          <h3 className="text-sm font-semibold">{t("activeLinks")}</h3>
          <ul className="divide-y rounded-xl border">
            {links.map((l) => (
              <li key={l._id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                <Link2 className="size-4 text-muted-foreground" aria-hidden />
                <Badge variant="secondary">{tr(l.role)}</Badge>
                <span className="text-muted-foreground">{t("linkUses", { count: l.uses })}</span>
                <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                  {t("expires", { date: format.dateTime(new Date(l.expiresAt), { dateStyle: "medium", timeStyle: "short" }) })}
                  {l.createdBy ? ` · ${t("linkBy", { name: l.createdBy })}` : ""}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={t("revokeLink")}
                  onClick={async () => {
                    try {
                      await revoke.mutateAsync(l._id);
                      toast.success(t("linkRevoked"));
                    } catch (err) {
                      toast.error(errorMessage(err));
                    }
                  }}
                >
                  <X className="size-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Section>
  );
}
