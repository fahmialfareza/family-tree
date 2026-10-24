"use client";

import { Heart, Link2, Plus, UserRoundPlus, Users, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { PersonAvatar } from "@/components/common/person-avatar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, errorMessage } from "@/lib/api/client";
import { addRelationships, useInvalidateTree } from "@/lib/api/hooks";
import type { Graph, GraphPerson, Relationship } from "@/lib/api/types";
import { lifeSpan } from "@/lib/format";
import { relativesOf } from "@/lib/relatives";

type Kind = "parent" | "spouse" | "child";

/** Parents, partners, children and siblings with links to re-center the tree; editors can link and unlink. */
export function RelativesPanel({
  treeId,
  personId,
  graph,
  canEdit,
  onFocus,
  onAddRelative,
}: {
  treeId: string;
  personId: string;
  graph: Graph | undefined;
  canEdit: boolean;
  onFocus: (id: string) => void;
  onAddRelative: (anchorId: string, kind: Kind) => void;
}) {
  const t = useTranslations("relatives");
  const invalidate = useInvalidateTree(treeId);
  const rel = relativesOf(graph, personId);
  const [linkKind, setLinkKind] = useState<Kind>("parent");
  const [linkTo, setLinkTo] = useState("");
  const [busy, setBusy] = useState(false);

  // "X is <kind> of this person" maps to the API's direction: stored on X as {to: person, type}.
  async function link() {
    if (!linkTo) return;
    setBusy(true);
    try {
      const type = linkKind === "parent" ? "parent" : linkKind === "child" ? "child" : "spouse";
      await addRelationships(treeId, linkTo, [{ to: personId, type }]);
      await invalidate();
      setLinkTo("");
      toast.success(t("linked"));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function unlink(other: GraphPerson) {
    try {
      const existing = await api.get<Relationship[]>(`/api/trees/${treeId}/people/${personId}/relationships`);
      const keep = existing.filter((r) => r.to !== other._id).map((r) => ({ to: r.to, type: r.type, order: r.order }));
      await api.post(`/api/trees/${treeId}/people/${personId}/relationships`, keep);
      await invalidate();
      toast.success(t("unlinked", { name: other.name }), {
        action: {
          label: t("undo"),
          onClick: async () => {
            const back = existing.filter((r) => r.to === other._id).map((r) => ({ to: r.to, type: r.type, order: r.order }));
            await addRelationships(treeId, personId, back);
            await invalidate();
          },
        },
      });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const groups: [string, GraphPerson[], Kind | null, typeof Users][] = [
    [t("parents"), rel.parents, "parent", Users],
    [t("partners"), rel.partners, "spouse", Heart],
    [t("children"), rel.children, "child", UserRoundPlus],
    [t("siblings"), rel.siblings, null, Users],
  ];
  const linked = new Set([personId, ...rel.parents, ...rel.partners, ...rel.children].map((p) => (typeof p === "string" ? p : p._id)));
  const candidates = (graph?.people ?? []).filter((p) => !linked.has(p._id)).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      {groups.map(([label, people, kind, Icon]) => (
        <section key={label} aria-label={label} className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Icon className="size-4 text-muted-foreground" aria-hidden /> {label}
            </h3>
            {canEdit && kind ? (
              <Button variant="ghost" size="sm" onClick={() => onAddRelative(personId, kind)}>
                <Plus className="size-4" aria-hidden /> {t("add")}
              </Button>
            ) : null}
          </div>
          {people.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("none")}</p>
          ) : (
            <ul className="space-y-1.5">
              {people.map((p) => (
                <li key={p._id} className="flex items-center gap-2 rounded-lg border bg-card p-1.5 pr-2">
                  <button type="button" onClick={() => onFocus(p._id)} className="flex min-w-0 flex-1 items-center gap-3 rounded-md p-1 text-left hover:bg-accent">
                    <PersonAvatar name={p.name} photoUrl={p.photoUrl} gender={p.gender} deceased={p.status === "deceased"} className="size-8 ring-1 ring-offset-1" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{p.name}</span>
                      <span className="block text-xs text-muted-foreground">{lifeSpan(p.birthDate, p.deathDate)}</span>
                    </span>
                  </button>
                  {canEdit && kind && p.canEdit ? (
                    <Button variant="ghost" size="icon" className="size-8" onClick={() => unlink(p)} aria-label={t("unlink", { name: p.name })}>
                      <X className="size-4" aria-hidden />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {canEdit && candidates.length > 0 ? (
        <section className="space-y-3 rounded-xl border border-dashed p-4" aria-label={t("linkExisting")}>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Link2 className="size-4 text-muted-foreground" aria-hidden /> {t("linkExisting")}
          </h3>
          <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
            <div className="space-y-1">
              <Label className="sr-only">{t("relation")}</Label>
              <Select value={linkKind} onValueChange={(v) => setLinkKind(v as Kind)}>
                <SelectTrigger className="w-full" aria-label={t("relation")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="parent">{t("isParent")}</SelectItem>
                  <SelectItem value="spouse">{t("isPartner")}</SelectItem>
                  <SelectItem value="child">{t("isChild")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Select value={linkTo} onValueChange={setLinkTo}>
              <SelectTrigger className="w-full" aria-label={t("person")}>
                <SelectValue placeholder={t("choosePerson")} />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((p) => (
                  <SelectItem key={p._id} value={p._id}>
                    {p.name} {lifeSpan(p.birthDate, p.deathDate) ? `(${lifeSpan(p.birthDate, p.deathDate)})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={link} disabled={!linkTo || busy}>
              {t("link")}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
