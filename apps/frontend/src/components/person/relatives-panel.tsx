"use client";

import { Heart, Link2, Pencil, Plus, UserRoundPlus, Users, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { PersonAvatar } from "@/components/common/person-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, errorMessage } from "@/lib/api/client";
import { addRelationships, relationshipInput, useInvalidateTree } from "@/lib/api/hooks";
import type { Graph, GraphPerson, ParentKind, PartnerStatus, Relationship, RelationshipDetails } from "@/lib/api/types";
import { formatPartialDate, lifeSpan } from "@/lib/format";
import { type PartnerLink, relativesOf, type SiblingKind } from "@/lib/relatives";
import { ParentKindSelect, PartnerStatusSelect } from "./link-fields";
import { type LinkEdit, RelationshipDialog } from "./relationship-dialog";

type Kind = "parent" | "spouse" | "child";

type Row = {
  person: GraphPerson;
  /** Set for parents, children and partners: which link the edit and unlink buttons act on. */
  role?: Kind;
  details?: RelationshipDetails;
  badge?: string;
  note?: string;
};

/** Parents, partners, children and siblings with links to re-center the tree; editors can link, edit and unlink. */
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
  const tl = useTranslations("links");
  const tq = useTranslations("person.qualifier");
  const locale = useLocale();
  const invalidate = useInvalidateTree(treeId);
  const rel = relativesOf(graph, personId);
  const self = graph?.people.find((p) => p._id === personId);
  const [linkKind, setLinkKind] = useState<Kind>("parent");
  const [linkParentKind, setLinkParentKind] = useState<ParentKind>("birth");
  const [linkStatus, setLinkStatus] = useState<PartnerStatus>("married");
  const [linkTo, setLinkTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<LinkEdit | null>(null);

  // "X is <kind> of this person" maps to the API's direction: stored on X as {to: person, type}.
  async function link() {
    if (!linkTo) return;
    setBusy(true);
    try {
      const type = linkKind === "parent" ? "parent" : linkKind === "child" ? "child" : "spouse";
      await addRelationships(treeId, linkTo, [
        linkKind === "spouse" ? { to: personId, type, status: linkStatus } : { to: personId, type, kind: linkParentKind },
      ]);
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
      const mine = existing.filter((r) => r.from === personId);
      // Every remaining link is sent back with its details (kind, status, dates), so none is reset.
      const keep = mine.filter((r) => r.to !== other._id).map(relationshipInput);
      await api.post(`/api/trees/${treeId}/people/${personId}/relationships`, keep);
      await invalidate();
      toast.success(t("unlinked", { name: other.name }), {
        action: {
          label: t("undo"),
          onClick: async () => {
            await addRelationships(treeId, personId, mine.filter((r) => r.to === other._id).map(relationshipInput));
            await invalidate();
          },
        },
      });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const date = (iso?: string, precision?: RelationshipDetails["startDatePrecision"], q?: RelationshipDetails["startDateQualifier"]) =>
    formatPartialDate(iso, precision, q, locale, (x) => tq(x));
  const partnerRow = (l: PartnerLink): Row => {
    const u = l.union;
    const married = date(u.startDate, u.startDatePrecision, u.startDateQualifier);
    const until = date(u.endDate, u.endDatePrecision, u.endDateQualifier);
    const note = [married && tl("marriedOn", { date: married }), until && tl("endedOn", { date: until })].filter(Boolean).join(" · ");
    const badge = u.status ? tl(`statuses.${u.status}`) : l.widowed ? tl("widowed") : undefined;
    return { person: l.person, role: "spouse", details: u, badge, note: note || undefined };
  };
  const kindBadge = (k: ParentKind) => (k === "birth" ? undefined : tl(`kinds.${k}`));

  const groups: { label: string; rows: Row[]; add: Kind | null; Icon: typeof Users }[] = [
    { label: t("parents"), rows: rel.parentLinks.map((l) => ({ person: l.person, role: "parent", details: { kind: l.kind }, badge: kindBadge(l.kind) })), add: "parent", Icon: Users },
    { label: t("partners"), rows: rel.partnerLinks.map(partnerRow), add: "spouse", Icon: Heart },
    { label: t("children"), rows: rel.childLinks.map((l) => ({ person: l.person, role: "child", details: { kind: l.kind }, badge: kindBadge(l.kind) })), add: "child", Icon: UserRoundPlus },
  ];
  const siblingKinds = [...new Set(rel.siblingLinks.map((s) => s.kind))] as SiblingKind[];
  const siblingGroups = siblingKinds.map((k) => ({ label: tl(`siblingKinds.${k}`), rows: rel.siblingLinks.filter((s) => s.kind === k).map((s) => ({ person: s.person })) }));

  const linked = new Set([personId, ...rel.parents, ...rel.partners, ...rel.children].map((p) => (typeof p === "string" ? p : p._id)));
  const candidates = (graph?.people ?? []).filter((p) => !linked.has(p._id)).sort((a, b) => a.name.localeCompare(b.name));

  const list = (rows: Row[]) =>
    rows.length === 0 ? (
      <p className="text-sm text-muted-foreground">{t("none")}</p>
    ) : (
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.person._id} className="flex items-center gap-1 rounded-lg border bg-card p-1.5 pr-2">
            <button type="button" onClick={() => onFocus(r.person._id)} className="flex min-w-0 flex-1 items-center gap-3 rounded-md p-1 text-left hover:bg-accent">
              <PersonAvatar
                name={r.person.name}
                photoUrl={r.person.photoUrl}
                gender={r.person.gender}
                deceased={r.person.status === "deceased"}
                className="size-8 ring-1 ring-offset-1"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{r.person.name}</span>
                  {r.badge ? (
                    <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[11px] font-normal">
                      {r.badge}
                    </Badge>
                  ) : null}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[lifeSpan(r.person.birthDate, r.person.deathDate), r.note].filter(Boolean).join(" · ")}
                </span>
              </span>
            </button>
            {canEdit && r.role && r.person.canEdit ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => setEditing({ other: r.person, role: r.role!, details: r.details ?? {} })}
                  aria-label={tl("edit", { name: r.person.name })}
                >
                  <Pencil className="size-4" aria-hidden />
                </Button>
                <Button variant="ghost" size="icon" className="size-8" onClick={() => unlink(r.person)} aria-label={t("unlink", { name: r.person.name })}>
                  <X className="size-4" aria-hidden />
                </Button>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    );

  return (
    <div className="space-y-6">
      {groups.map(({ label, rows, add, Icon }) => (
        <section key={label} aria-label={label} className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Icon className="size-4 text-muted-foreground" aria-hidden /> {label}
            </h3>
            {canEdit && add ? (
              <Button variant="ghost" size="sm" onClick={() => onAddRelative(personId, add)}>
                <Plus className="size-4" aria-hidden /> {t("add")}
              </Button>
            ) : null}
          </div>
          {list(rows)}
        </section>
      ))}

      <section aria-label={t("siblings")} className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Users className="size-4 text-muted-foreground" aria-hidden /> {t("siblings")}
        </h3>
        {siblingGroups.length === 0
          ? list([])
          : siblingGroups.map((g) => (
              <div key={g.label} className="space-y-1.5">
                {siblingGroups.length > 1 || siblingKinds[0] !== "full" ? <p className="text-xs font-medium text-muted-foreground">{g.label}</p> : null}
                {list(g.rows)}
              </div>
            ))}
      </section>

      {canEdit && candidates.length > 0 ? (
        <section className="space-y-3 rounded-xl border border-dashed p-4" aria-label={t("linkExisting")}>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Link2 className="size-4 text-muted-foreground" aria-hidden /> {t("linkExisting")}
          </h3>
          <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr]">
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
          </div>
          <div className="grid items-end gap-2 sm:grid-cols-[1fr_auto]">
            {linkKind === "spouse" ? (
              <PartnerStatusSelect value={linkStatus} onChange={setLinkStatus} />
            ) : (
              <ParentKindSelect value={linkParentKind} onChange={setLinkParentKind} label={tl("as")} />
            )}
            <Button onClick={link} disabled={!linkTo || busy}>
              {t("link")}
            </Button>
          </div>
        </section>
      ) : null}

      {self ? <RelationshipDialog treeId={treeId} person={self} edit={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
