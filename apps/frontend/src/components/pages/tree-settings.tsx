"use client";

import { Download, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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

export function TreeSettings({ treeId }: { treeId: string }) {
  const t = useTranslations("settings");
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

      <Section title={t("export")} description={t("exportHelp")}>
        <Button asChild variant="outline">
          <a
            href={`/api/proxy/api/trees/${treeId}/export`}
            download={`${tree.name}.json`}
            onClick={nativeDownloadHandler(`/api/proxy/api/trees/${treeId}/export`, `${tree.name}.json`, (err) => toast.error(errorMessage(err)))}
          >
            <Download className="size-4" aria-hidden /> {t("downloadJson")}
          </a>
        </Button>
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
