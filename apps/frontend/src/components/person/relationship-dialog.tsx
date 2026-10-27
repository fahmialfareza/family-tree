"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Field, FormError } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api/client";
import { addRelationships, useInvalidateTree } from "@/lib/api/hooks";
import type { GraphPerson, ParentKind, PartnerStatus, RelationshipDetails } from "@/lib/api/types";
import { dateParts, partsToValue } from "@/lib/format";
import { ParentKindSelect, PartnerStatusSelect } from "./link-fields";
import { type PartialDate, PartialDateInput } from "./partial-date-input";

/** Which link is edited: `other` is `person`'s parent, child or partner. */
export type LinkEdit = { other: GraphPerson; role: "parent" | "child" | "spouse"; details: RelationshipDetails };

const toPartial = (iso?: string, precision?: RelationshipDetails["startDatePrecision"], qualifier?: RelationshipDetails["startDateQualifier"]): PartialDate => ({
  ...dateParts(iso, precision),
  qualifier: qualifier ?? "exact",
});

/** Edits how two people are related: the kind of a parent link, or a couple's status, marriage and end. */
export function RelationshipDialog({
  treeId,
  person,
  edit,
  onClose,
}: {
  treeId: string;
  person: GraphPerson;
  edit: LinkEdit | null;
  onClose: () => void;
}) {
  const t = useTranslations("links");
  return (
    <Dialog open={!!edit} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{edit ? t("editTitle", { person: person.name, other: edit.other.name }) : ""}</DialogTitle>
          <DialogDescription>{t("editDescription")}</DialogDescription>
        </DialogHeader>
        {edit ? <LinkForm key={`${edit.other._id}:${edit.role}`} treeId={treeId} person={person} edit={edit} onDone={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function LinkForm({ treeId, person, edit, onDone }: { treeId: string; person: GraphPerson; edit: LinkEdit; onDone: () => void }) {
  const t = useTranslations("links");
  const tc = useTranslations("common");
  const invalidate = useInvalidateTree(treeId);
  const d = edit.details;
  const [kind, setKind] = useState<ParentKind>(d.kind ?? "birth");
  const [status, setStatus] = useState<PartnerStatus>(d.status ?? "married");
  const [start, setStart] = useState<PartialDate>(() => toPartial(d.startDate, d.startDatePrecision, d.startDateQualifier));
  const [place, setPlace] = useState(d.startPlace ?? "");
  const [end, setEnd] = useState<PartialDate>(() => toPartial(d.endDate, d.endDatePrecision, d.endDateQualifier));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const couple = edit.role === "spouse";
  const ended = status === "divorced" || status === "separated";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    // Stored on `person`: the other is their parent → person is the child, and the reverse.
    const type = edit.role === "parent" ? "child" : edit.role === "child" ? "parent" : "spouse";
    const startDate = partsToValue(start.year, start.month, start.day);
    const endDate = ended ? partsToValue(end.year, end.month, end.day) : "";
    try {
      await addRelationships(treeId, person._id, [
        couple
          ? {
              to: edit.other._id,
              type,
              status,
              startDate,
              startDateQualifier: startDate ? start.qualifier : undefined,
              startPlace: place.trim(),
              endDate,
              endDateQualifier: endDate ? end.qualifier : undefined,
            }
          : { to: edit.other._id, type, kind },
      ]);
      await invalidate();
      toast.success(t("saved"));
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <FormError message={error} />
      {couple ? (
        <>
          <PartnerStatusSelect value={status} onChange={setStatus} />
          {status !== "engaged" && status !== "partner" ? (
            <>
              <PartialDateInput label={t("marriageDate")} value={start} onChange={setStart} />
              <Field label={t("marriagePlace")}>{(p) => <Input {...p} value={place} onChange={(e) => setPlace(e.target.value)} maxLength={200} />}</Field>
            </>
          ) : null}
          {ended ? <PartialDateInput label={t("endDate")} value={end} onChange={setEnd} /> : null}
        </>
      ) : (
        <div className="space-y-1.5">
          <ParentKindSelect value={kind} onChange={setKind} />
          <p className="text-xs text-muted-foreground">{t("kindHint")}</p>
        </div>
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          {tc("cancel")}
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null} {tc("save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
