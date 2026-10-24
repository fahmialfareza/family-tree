"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Field, FormError } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, errorMessage } from "@/lib/api/client";
import { type RelationshipInput, useInvalidateTree } from "@/lib/api/hooks";
import type { Gender, Graph, Person } from "@/lib/api/types";

export type QuickAddRequest = {
  anchorId: string;
  kind: "parent" | "spouse" | "child";
} | null;

const NONE = "none";

/**
 * Adds a relative in one step: create the person, then link them to the anchor (and, for a child, to the
 * anchor's partner). Only name is asked; "Add details" happens afterwards in the drawer.
 */
export function QuickAddDialog({
  treeId,
  graph,
  request,
  onClose,
  onCreated,
}: {
  treeId: string;
  graph: Graph | undefined;
  request: QuickAddRequest;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const t = useTranslations("quickAdd");
  const anchor = graph?.people.find((p) => p._id === request?.anchorId);
  return (
    <Dialog open={!!request} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {request
              ? t(`title.${request.kind}`, {
                  name: anchor?.nickname || anchor?.name || "",
                })
              : ""}
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        {request ? (
          <QuickAddForm
            key={`${request.anchorId}:${request.kind}`}
            treeId={treeId}
            graph={graph}
            request={request}
            onClose={onClose}
            onCreated={onCreated}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function QuickAddForm({
  treeId,
  graph,
  request,
  onClose,
  onCreated,
}: {
  treeId: string;
  graph: Graph | undefined;
  request: NonNullable<QuickAddRequest>;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const t = useTranslations("quickAdd");
  const tp = useTranslations("person");
  const tc = useTranslations("common");
  const invalidate = useInvalidateTree(treeId);
  const anchor = graph?.people.find((p) => p._id === request.anchorId);
  const partners = useMemo(() => {
    if (!graph) return [];
    const ids = graph.unions.flatMap((u) =>
      u.partners.includes(request.anchorId)
        ? u.partners.filter((x) => x !== request.anchorId)
        : [],
    );
    return graph.people.filter((p) => ids.includes(p._id));
  }, [graph, request]);
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender>(() =>
    request.kind === "spouse" && anchor
      ? anchor.gender === "male"
        ? "female"
        : anchor.gender === "female"
          ? "male"
          : "unknown"
      : "unknown",
  );
  const [year, setYear] = useState("");
  const [coParent, setCoParent] = useState<string>(() =>
    request.kind === "child" && partners.length === 1 ? partners[0]._id : NONE,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("name", name.trim());
      fd.set("gender", gender);
      fd.set("status", "alive");
      if (/^\d{4}$/.test(year)) fd.set("birthDate", year);
      const created = await api.post<Person>(`/api/trees/${treeId}/people`, fd);
      const links: RelationshipInput[] =
        request.kind === "parent"
          ? [{ to: request.anchorId, type: "parent" }]
          : request.kind === "spouse"
            ? [{ to: request.anchorId, type: "spouse" }]
            : [
                { to: request.anchorId, type: "child" },
                ...(coParent !== NONE
                  ? [{ to: coParent, type: "child" as const }]
                  : []),
              ];
      try {
        await api.post(
          `/api/trees/${treeId}/people/${created._id}/relationships`,
          links,
        );
      } catch (err) {
        toast.error(t("linkFailed", { message: errorMessage(err) }));
      }
      await invalidate();
      toast.success(t("added", { name: created.name }));
      onCreated(created._id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormError message={error} />
      <Field label={tp("name")} required>
        {(p) => (
          <Input
            {...p}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            autoFocus
            required
          />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>{tp("gender")}</Label>
          <Select value={gender} onValueChange={(v) => setGender(v as Gender)}>
            <SelectTrigger className="w-full" aria-label={tp("gender")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["female", "male", "other", "unknown"] as const).map((g) => (
                <SelectItem key={g} value={g}>
                  {tp(`genders.${g}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Field label={t("birthYear")}>
          {(p) => (
            <Input
              {...p}
              inputMode="numeric"
              maxLength={4}
              value={year}
              onChange={(e) => setYear(e.target.value.replace(/\D/g, ""))}
              placeholder="1975"
            />
          )}
        </Field>
      </div>
      {request.kind === "child" && partners.length > 0 ? (
        <div className="space-y-1.5">
          <Label>{t("otherParent")}</Label>
          <Select value={coParent} onValueChange={setCoParent}>
            <SelectTrigger className="w-full" aria-label={t("otherParent")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t("noOtherParent")}</SelectItem>
              {partners.map((p) => (
                <SelectItem key={p._id} value={p._id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          {tc("cancel")}
        </Button>
        <Button type="submit" disabled={busy || !name.trim()}>
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : null}
          {tc("add")}
        </Button>
      </DialogFooter>
    </form>
  );
}
