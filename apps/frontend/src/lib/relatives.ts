import type { Graph, GraphPerson, GraphUnion, ParentKind } from "@/lib/api/types";

/** How two siblings are related: kandung, seayah/seibu (half), tiri, angkat, asuh (foster or guardian), susuan. */
export type SiblingKind = "full" | "half" | "step" | "adopted" | "foster" | "milk";

export type ParentLink = { person: GraphPerson; kind: ParentKind };
export type PartnerLink = { person: GraphPerson; union: GraphUnion; widowed: boolean };
export type SiblingLink = { person: GraphPerson; kind: SiblingKind };

export type Relatives = {
  parents: GraphPerson[];
  partners: GraphPerson[];
  children: GraphPerson[];
  siblings: GraphPerson[];
  /** The same people with the kind of each link. */
  parentLinks: ParentLink[];
  partnerLinks: PartnerLink[];
  childLinks: ParentLink[];
  siblingLinks: SiblingLink[];
};

const SIBLING_ORDER: SiblingKind[] = ["full", "half", "step", "adopted", "foster", "milk"];

const empty = (): Relatives => ({
  parents: [],
  partners: [],
  children: [],
  siblings: [],
  parentLinks: [],
  partnerLinks: [],
  childLinks: [],
  siblingLinks: [],
});

/** Immediate family of a person, derived from the tree graph, with birth and other parents told apart. */
export function relativesOf(graph: Graph | undefined, id: string): Relatives {
  if (!graph) return empty();
  const byId = new Map(graph.people.map((p) => [p._id, p]));
  const kindOf = (k?: ParentKind): ParentKind => k ?? "birth";

  const parentsOf = (x: string) => graph.parentChild.filter((pc) => pc.child === x);
  const childrenOf = (x: string) => graph.parentChild.filter((pc) => pc.parent === x);
  const partnersOf = (x: string) => graph.unions.filter((u) => u.partners.includes(x));
  const birthParents = (x: string) => new Set(parentsOf(x).filter((pc) => kindOf(pc.kind) === "birth").map((pc) => pc.parent));

  // Adds the person (when they are in the graph) to a list, once.
  const link = <T extends { person: GraphPerson }>(list: T[], personId: string, make: (p: GraphPerson) => T) => {
    const p = byId.get(personId);
    if (p && !list.some((l) => l.person._id === personId)) list.push(make(p));
  };

  const parentLinks: ParentLink[] = [];
  for (const pc of parentsOf(id)) link(parentLinks, pc.parent, (person) => ({ person, kind: kindOf(pc.kind) }));
  const childLinks: ParentLink[] = [];
  for (const pc of [...childrenOf(id)].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    link(childLinks, pc.child, (person) => ({ person, kind: kindOf(pc.kind) }));
  }
  const partnerLinks: PartnerLink[] = [];
  for (const u of partnersOf(id)) {
    const other = u.partners[0] === id ? u.partners[1] : u.partners[0];
    // Widowed (cerai mati): still married when the partner died.
    link(partnerLinks, other, (person) => ({ person, union: u, widowed: !u.status && person.status === "deceased" }));
  }

  // Siblings: anyone sharing a parent, or a child of a parent's partner (step), classified by the closest bond.
  const myBirth = birthParents(id);
  const myParents = parentLinks.map((l) => l.person._id);
  const candidates = new Set<string>();
  for (const p of myParents) for (const pc of childrenOf(p)) candidates.add(pc.child);
  for (const p of myBirth) for (const u of partnersOf(p)) for (const q of u.partners) for (const pc of childrenOf(q)) candidates.add(pc.child);
  candidates.delete(id);

  const siblingLinks: SiblingLink[] = [];
  for (const other of candidates) {
    const theirBirth = birthParents(other);
    const sharedBirth = [...myBirth].filter((p) => theirBirth.has(p)).length;
    let kind: SiblingKind | undefined;
    if (sharedBirth > 0) {
      // Full when they share both birth parents, or the only one either of them has recorded.
      kind = sharedBirth >= 2 || (myBirth.size <= 1 && theirBirth.size <= 1) ? "full" : "half";
    } else {
      const shared = parentsOf(other).filter((pc) => myParents.includes(pc.parent));
      const sharedKinds = new Set([
        ...shared.map((pc) => kindOf(pc.kind)),
        ...parentLinks.filter((l) => shared.some((pc) => pc.parent === l.person._id)).map((l) => l.kind),
      ]);
      if (sharedKinds.has("adopted")) kind = "adopted";
      else if (sharedKinds.has("foster") || sharedKinds.has("guardian")) kind = "foster";
      else if (sharedKinds.has("milk")) kind = "milk";
      else kind = "step"; // shares only a step-parent, or is the child of a birth parent's partner
    }
    link(siblingLinks, other, (person) => ({ person, kind: kind! }));
  }
  siblingLinks.sort((a, b) => SIBLING_ORDER.indexOf(a.kind) - SIBLING_ORDER.indexOf(b.kind) || (a.person.birthDate ?? "").localeCompare(b.person.birthDate ?? ""));

  return {
    parents: parentLinks.map((l) => l.person),
    partners: partnerLinks.map((l) => l.person),
    children: childLinks.map((l) => l.person),
    siblings: siblingLinks.map((l) => l.person),
    parentLinks,
    partnerLinks,
    childLinks,
    siblingLinks,
  };
}
