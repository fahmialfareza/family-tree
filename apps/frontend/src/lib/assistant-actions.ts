import { api } from "@/lib/api/client";
import { addRelationships, type RelationshipInput } from "@/lib/api/hooks";
import type { AssistantAction, AssistantPersonFields, ParentKind, PartnerStatus, Person } from "@/lib/api/types";
import { dateParts, partsToValue } from "@/lib/format";

// Applies a change the assistant proposed, through the same endpoints and permission checks as the forms.
// Runs only when the user presses Apply.

/** The proposed link's kind as relationship details: a parent kind, or a partner status. */
function linkDetails(a: AssistantAction): Pick<RelationshipInput, "kind" | "status"> {
  if (!a.kind) return {};
  return a.relation === "partner" ? { status: a.kind as PartnerStatus } : { kind: a.kind as ParentKind };
}

const RELATION_TYPE: Record<NonNullable<AssistantAction["relation"]>, RelationshipInput["type"]> = {
  parent: "parent",
  child: "child",
  partner: "spouse",
};

const tree = (treeId: string) => `/api/trees/${encodeURIComponent(treeId)}`;

/** The full person form (the API replaces every field on update), built from the stored person plus changes. */
function personForm(base: Partial<Person>, f: AssistantPersonFields): FormData {
  const pick = <T,>(change: T | undefined, current: T | undefined, fallback: T) => change ?? current ?? fallback;
  const storedDate = (iso?: string, precision?: Person["birthDatePrecision"]) => {
    const { year, month, day } = dateParts(iso, precision);
    return partsToValue(year, month, day);
  };
  const status = pick(f.status, base.status, "alive");
  const birthDate = f.birthDate ?? storedDate(base.birthDate, base.birthDatePrecision);
  const birthQualifier = f.birthDate !== undefined ? (f.birthDateQualifier ?? "exact") : pick(f.birthDateQualifier, base.birthDateQualifier, "exact");
  const deathDate = status === "deceased" ? (f.deathDate ?? storedDate(base.deathDate, base.deathDatePrecision)) : "";
  const deathQualifier = f.deathDate !== undefined ? (f.deathDateQualifier ?? "exact") : pick(f.deathDateQualifier, base.deathDateQualifier, "exact");

  const fd = new FormData();
  fd.set("name", pick(f.name, base.name, ""));
  fd.set("nickname", pick(f.nickname, base.nickname, ""));
  fd.set("gender", pick(f.gender, base.gender, "unknown"));
  fd.set("status", status);
  fd.set("birthDate", birthDate);
  fd.set("birthDateQualifier", birthDate ? birthQualifier : "");
  fd.set("birthPlace", pick(f.birthPlace, base.birthPlace, ""));
  fd.set("deathDate", deathDate);
  fd.set("deathDateQualifier", deathDate ? deathQualifier : "");
  fd.set("deathPlace", status === "deceased" ? pick(f.deathPlace, base.deathPlace, "") : "");
  fd.set("phone", base.phone ?? "");
  fd.set("address", pick(f.address, base.address, ""));
  fd.set("notes", pick(f.notes, base.notes, ""));
  fd.set("religion", pick(f.religion, base.religion, ""));
  return fd;
}

/** Applies one action; returns the person to show afterwards, if any. */
export async function applyAssistantAction(treeId: string, a: AssistantAction): Promise<{ personId?: string }> {
  switch (a.type) {
    case "add_person": {
      const created = await api.post<Person>(`${tree(treeId)}/people`, personForm({}, a.fields ?? {}));
      if (a.relativeId && a.relation) {
        const links: RelationshipInput[] = [{ to: a.relativeId, type: RELATION_TYPE[a.relation], ...linkDetails(a) }];
        if (a.relation === "child" && a.otherParentId) links.push({ to: a.otherParentId, type: "child", ...linkDetails(a) });
        await api.post(`${tree(treeId)}/people/${encodeURIComponent(created._id)}/relationships`, links);
      }
      return { personId: created._id };
    }
    case "update_person": {
      const id = encodeURIComponent(a.personId!);
      const current = await api.get<Person>(`${tree(treeId)}/people/${id}`);
      await api.put<Person>(`${tree(treeId)}/people/${id}`, personForm(current, a.fields ?? {}));
      return { personId: a.personId };
    }
    case "add_relationship":
      await addRelationships(treeId, a.personId!, [{ to: a.relativeId!, type: RELATION_TYPE[a.relation!], ...linkDetails(a) }]);
      return { personId: a.personId };
    case "add_family":
      await api.post(`${tree(treeId)}/families`, { name: a.familyName, person: a.personId });
      return { personId: a.personId };
    case "rename_family":
      await api.patch(`${tree(treeId)}/families/${encodeURIComponent(a.familyId!)}`, { name: a.familyName });
      return {};
  }
}
