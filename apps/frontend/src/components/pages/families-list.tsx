"use client";

import { Heart, Plus, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Field } from "@/components/common/field";
import { EmptyState, PageContainer, PageHeader } from "@/components/common/page";
import { PersonAvatar } from "@/components/common/person-avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api/client";
import { useCreateFamily, useDeleteFamily, useFamilies, useGraph } from "@/lib/api/hooks";
import { relativesOf } from "@/lib/relatives";
import { useOnlineRole } from "@/lib/offline";

/** A family groups a person with their partner(s) and children; it opens on the canvas centered on them. */
export function FamiliesList({ treeId }: { treeId: string }) {
  const t = useTranslations("families");
  const tc = useTranslations("common");
  const { data: families, isLoading } = useFamilies(treeId);
  const { data: graph } = useGraph(treeId);
  const create = useCreateFamily(treeId);
  const remove = useDeleteFamily(treeId);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [personId, setPersonId] = useState("");
  const role = useOnlineRole(graph?.tree.role ?? "viewer");
  const editable = (graph?.people ?? []).filter((p) => p.canEdit).sort((a, b) => a.name.localeCompare(b.name));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await create.mutateAsync({ name: name.trim(), person: personId });
      toast.success(t("created"));
      setOpen(false);
      setName("");
      setPersonId("");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          role !== "viewer" ? (
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" aria-hidden /> {t("add")}
            </Button>
          ) : undefined
        }
      />
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : !families?.length ? (
        <EmptyState icon={Users} title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {families.map((f) => {
            const head = f.person;
            const rel = head ? relativesOf(graph, head._id) : null;
            return (
              <li key={f._id} className="rounded-xl border bg-card p-4 shadow-[var(--shadow-soft)]">
                <div className="flex items-start justify-between gap-2">
                  <Link href={head ? `/app/t/${treeId}?focus=${head._id}` : `/app/t/${treeId}`} className="min-w-0 rounded-md focus-visible:ring-2 focus-visible:ring-ring">
                    <h2 className="truncate font-display text-lg font-semibold hover:underline">{f.name}</h2>
                  </Link>
                  {role !== "viewer" ? (
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="icon" className="size-8" aria-label={t("delete", { name: f.name })}>
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      }
                      title={t("delete", { name: f.name })}
                      description={t("deleteBody")}
                      confirmLabel={tc("delete")}
                      onConfirm={async () => {
                        try {
                          await remove.mutateAsync(f._id);
                          toast.success(t("deleted"));
                        } catch (err) {
                          toast.error(errorMessage(err));
                        }
                      }}
                    />
                  ) : null}
                </div>
                {head && rel ? (
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <PersonAvatar name={head.name} photoUrl={head.photoUrl} gender={head.gender} className="size-7 ring-1 ring-offset-1" />
                      <span className="font-medium">{head.name}</span>
                      {rel.partners.map((p) => (
                        <span key={p._id} className="inline-flex items-center gap-1 text-muted-foreground">
                          <Heart className="size-3.5 text-terracotta" aria-hidden /> {p.name}
                        </span>
                      ))}
                    </div>
                    {rel.children.length ? (
                      <p className="text-muted-foreground">
                        {t("children", { count: rel.children.length })}: {rel.children.map((c) => c.nickname || c.name).join(", ")}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("add")}</DialogTitle>
            <DialogDescription>{t("addHint")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <Field label={t("name")} required>
              {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} maxLength={120} required autoFocus />}
            </Field>
            <div className="space-y-1.5">
              <Label>{t("head")}</Label>
              <Select value={personId} onValueChange={setPersonId}>
                <SelectTrigger className="w-full" aria-label={t("head")}>
                  <SelectValue placeholder={t("choosePerson")} />
                </SelectTrigger>
                <SelectContent>
                  {editable.map((p) => (
                    <SelectItem key={p._id} value={p._id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                {tc("cancel")}
              </Button>
              <Button type="submit" disabled={!name.trim() || !personId || create.isPending}>
                {tc("create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
