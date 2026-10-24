import type { Graph, GraphPerson } from "@/lib/api/types";

export type Relatives = {
  parents: GraphPerson[];
  partners: GraphPerson[];
  children: GraphPerson[];
  siblings: GraphPerson[];
};

/** Immediate family of a person, derived from the tree graph. */
export function relativesOf(graph: Graph | undefined, id: string): Relatives {
  if (!graph) return { parents: [], partners: [], children: [], siblings: [] };
  const byId = new Map(graph.people.map((p) => [p._id, p]));
  const pick = (ids: Iterable<string>) => [...new Set(ids)].map((x) => byId.get(x)).filter((p): p is GraphPerson => !!p);
  const parentIds = graph.parentChild.filter((pc) => pc.child === id).map((pc) => pc.parent);
  const childIds = graph.parentChild
    .filter((pc) => pc.parent === id)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((pc) => pc.child);
  const partnerIds = graph.unions.flatMap((u) => (u.partners.includes(id) ? u.partners.filter((x) => x !== id) : []));
  const siblingIds = graph.parentChild.filter((pc) => parentIds.includes(pc.parent) && pc.child !== id).map((pc) => pc.child);
  return { parents: pick(parentIds), partners: pick(partnerIds), children: pick(childIds), siblings: pick(siblingIds) };
}
