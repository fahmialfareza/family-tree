"use client";

import { DatabaseBackup, Download, FileSpreadsheet, GitFork, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Field } from "@/components/common/field";
import { PageContainer, PageHeader, Section } from "@/components/common/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/api/client";
import { useDeleteTree, useTree, useUpdateTree } from "@/lib/api/hooks";
import { nativeDownloadHandler } from "@/lib/native";

// Excel first: everyone can open it. GEDCOM moves the tree to other genealogy apps; JSON is the full backup.
const EXPORTS = [
  { format: "xlsx", ext: "xlsx", icon: FileSpreadsheet },
  { format: "gedcom", ext: "ged", icon: GitFork },
  { format: "json", ext: "json", icon: DatabaseBackup },
] as const;

export function TreeSettings({ treeId }: { treeId: string }) {
  const t = useTranslations("settings");
  const locale = useLocale();
  const tc = useTranslations("common");
  const router = useRouter();
  const { data: tree } = useTree(treeId);
  const update = useUpdateTree(treeId);
  const del = useDeleteTree(treeId);
  const [nameDraft, setName] = useState<string | null>(null);

  if (!tree) return null;
  const name = nameDraft ?? tree.name;
  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title={t("title")} description={t("description")} />

      <Section title={t("general")}>
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await update.mutateAsync({ name: name.trim() });
              toast.success(t("saved"));
              router.refresh();
            } catch (err) {
              toast.error(errorMessage(err));
            }
          }}
        >
          <Field label={t("name")} className="flex-1" required>
            {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />}
          </Field>
          <Button type="submit" disabled={!name.trim() || name === tree.name || update.isPending}>
            {update.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {tc("save")}
          </Button>
        </form>
      </Section>

      <Section title={t("privacy")}>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p id="branch-label" className="text-sm font-medium">
              {t("branchScoped")}
            </p>
            <p className="text-sm text-muted-foreground">{t("branchScopedHelp")}</p>
          </div>
          <Switch
            aria-labelledby="branch-label"
            checked={tree.branchScoped}
            onCheckedChange={async (on) => {
              try {
                await update.mutateAsync({ branchScoped: on });
                toast.success(t("saved"));
              } catch (err) {
                toast.error(errorMessage(err));
              }
            }}
          />
        </div>
      </Section>

      <Section title={t("assistant")}>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p id="assistant-label" className="text-sm font-medium">
              {t("assistantToggle")}
            </p>
            <p className="text-sm text-muted-foreground">{tree.assistantAvailable ? t("assistantHelp") : t("assistantUnavailable")}</p>
          </div>
          <Switch
            aria-labelledby="assistant-label"
            checked={!!tree.assistantEnabled}
            disabled={!tree.assistantAvailable && !tree.assistantEnabled}
            onCheckedChange={async (on) => {
              try {
                await update.mutateAsync({ assistantEnabled: on });
                toast.success(t("saved"));
              } catch (err) {
                toast.error(errorMessage(err));
              }
            }}
          />
        </div>
      </Section>

      <Section title={t("export")} description={t("exportHelp")}>
        <ul className="space-y-3">
          {EXPORTS.map((x) => {
            const url = `/api/proxy/api/trees/${treeId}/export?format=${x.format}&lang=${locale}`;
            const file = `${tree.name}.${x.ext}`;
            return (
              <li key={x.format} className="flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="flex items-start gap-3">
                  <x.icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                  <span>
                    <span className="block text-sm font-medium">{t(`exportFormats.${x.format}.title`)}</span>
                    <span className="block text-sm text-muted-foreground">{t(`exportFormats.${x.format}.body`)}</span>
                  </span>
                </span>
                <Button asChild variant={x.format === "xlsx" ? "default" : "outline"} size="sm" className="shrink-0 self-start sm:self-auto">
                  <a href={url} download={file} onClick={nativeDownloadHandler(url, file, (err) => toast.error(errorMessage(err)))}>
                    <Download className="size-4" aria-hidden /> {t(`exportFormats.${x.format}.action`)}
                  </a>
                </Button>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-sm text-muted-foreground">
          {t("exportPicture")}{" "}
          <Link href={`/app/t/${treeId}`} className="font-medium text-primary underline-offset-4 hover:underline">
            {t("exportPictureLink")}
          </Link>
        </p>
      </Section>

      <Section title={t("danger")} className="border-destructive/40">
        <p className="mb-4 text-sm text-muted-foreground">{t("deleteHelp")}</p>
        <ConfirmDialog
          trigger={
            <Button variant="destructive">
              <Trash2 className="size-4" aria-hidden /> {t("deleteTree")}
            </Button>
          }
          title={t("deleteTitle", { name: tree.name })}
          description={t("deleteBody")}
          confirmLabel={tc("delete")}
          typeToConfirm={tree.name}
          onConfirm={async () => {
            try {
              await del.mutateAsync();
              toast.success(t("deleted"));
              router.push("/app");
            } catch (err) {
              toast.error(errorMessage(err));
            }
          }}
        />
      </Section>
    </PageContainer>
  );
}
