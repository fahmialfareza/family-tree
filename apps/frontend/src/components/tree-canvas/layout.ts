import ELK, { type ElkExtendedEdge, type ElkNode } from "elkjs/lib/elk.bundled.js";
import type { Edge, Node } from "@xyflow/react";
import type { Graph, GraphPerson, ParentKind, PartnerStatus } from "@/lib/api/types";

// Genealogy layout on top of ELK's layered (Sugiyama) algorithm.
// Every couple, and every pair of co-parents, becomes a tiny "union" node: both partners point down into
// it and their children hang below it. Children of a single known parent connect to that parent directly.
// This handles spouses, two parents, remarriage and half-siblings without special cases; ELK picks
// generations (layers) and minimizes crossings.
// A child can also have parents of other kinds (adoptive, step, foster, guardian, milk). Only the primary set
// is laid out: birth parents when recorded, else adoptive, else whatever exists. The others are drawn after the
// layout as dashed, labelled lines, so a foster parent elsewhere in the tree doesn't pull the child away.

export const PERSON_WIDTH = 208;
export const PERSON_HEIGHT = 72;
const UNION_SIZE = 10;

export type PersonNodeData = { person: GraphPerson; focused: boolean; isSelf: boolean };
export type PersonFlowNode = Node<PersonNodeData, "person">;
export type UnionFlowNode = Node<{ status?: PartnerStatus }, "union">;
export type FlowNode = PersonFlowNode | UnionFlowNode;

const elk = new ELK();

const unionId = (a: string, b: string) => (a < b ? `u:${a}:${b}` : `u:${b}:${a}`);

/**
 * Keeps people within `depth` relationship steps of the focus person (all people when depth is Infinity).
 * Large trees stay readable; the rest is reachable by re-focusing.
 */
export function neighbourhood(graph: Graph, focusId: string | undefined, depth: number): Set<string> {
  const ids = new Set(graph.people.map((p) => p._id));
  if (!focusId || !ids.has(focusId) || !Number.isFinite(depth)) return ids;
  const adj = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    adj.set(a, [...(adj.get(a) ?? []), b]);
    adj.set(b, [...(adj.get(b) ?? []), a]);
  };
  graph.unions.forEach((u) => link(u.partners[0], u.partners[1]));
  graph.parentChild.forEach((pc) => link(pc.parent, pc.child));
  const seen = new Set([focusId]);
  let frontier = [focusId];
  for (let d = 0; d < depth && frontier.length; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const n of adj.get(id) ?? []) {
        if (!seen.has(n) && ids.has(n)) {
          seen.add(n);
          next.push(n);
        }
      }
    }
    frontier = next;
  }
  return seen;
}

export async function layoutGraph(
  graph: Graph,
  visible: Set<string>,
  opts: { focusId?: string; selfId?: string; kindLabel?: (kind: Exclude<ParentKind, "birth">) => string },
): Promise<{ nodes: FlowNode[]; edges: Edge[] }> {
  const people = graph.people.filter((p) => visible.has(p._id));
  const elkNodes: ElkNode[] = people.map((p) => ({ id: p._id, width: PERSON_WIDTH, height: PERSON_HEIGHT }));
  const elkEdges: ElkExtendedEdge[] = [];
  const unions = new Map<string, [string, string]>();
  const unionStatus = new Map(graph.unions.map((u) => [unionId(u.partners[0], u.partners[1]), u.status]));

  const ensureUnion = (a: string, b: string) => {
    const id = unionId(a, b);
    if (!unions.has(id)) {
      unions.set(id, [a, b]);
      elkNodes.push({ id, width: UNION_SIZE, height: UNION_SIZE });
      elkEdges.push({ id: `e:${a}:${id}`, sources: [a], targets: [id] }, { id: `e:${b}:${id}`, sources: [b], targets: [id] });
    }
    return id;
  };

  for (const u of graph.unions) {
    if (visible.has(u.partners[0]) && visible.has(u.partners[1])) ensureUnion(u.partners[0], u.partners[1]);
  }

  // Group each child's visible parents by kind, ordered by sibling order for stable placement.
  const linksOf = new Map<string, Map<ParentKind, string[]>>();
  const orderOf = new Map<string, number>();
  for (const pc of [...graph.parentChild].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    if (!visible.has(pc.parent) || !visible.has(pc.child)) continue;
    const byKind = linksOf.get(pc.child) ?? new Map<ParentKind, string[]>();
    const kind = pc.kind ?? "birth";
    byKind.set(kind, [...(byKind.get(kind) ?? []), pc.parent]);
    linksOf.set(pc.child, byKind);
    if (!orderOf.has(pc.child)) orderOf.set(pc.child, pc.order ?? 0);
  }
  const primaryKind = (byKind: Map<ParentKind, string[]>): ParentKind =>
    byKind.has("birth") ? "birth" : byKind.has("adopted") ? "adopted" : [...byKind.keys()][0];
  const parentsOf = new Map<string, string[]>();
  const extra: { from: string; child: string; kind: Exclude<ParentKind, "birth"> }[] = [];
  for (const [child, byKind] of linksOf) {
    const primary = primaryKind(byKind);
    parentsOf.set(child, byKind.get(primary)!);
    for (const [kind, parents] of byKind) {
      if (kind === primary || kind === "birth") continue;
      const set = [...new Set(parents)].sort();
      // A couple who are both, e.g., foster parents: one line from their union dot.
      const fromUnion = set.length === 2 && unionStatus.has(unionId(set[0], set[1]));
      if (fromUnion) extra.push({ from: ensureUnion(set[0], set[1]), child, kind });
      else for (const p of set) extra.push({ from: p, child, kind });
    }
  }
  const children = [...parentsOf.keys()].sort((a, b) => (orderOf.get(a) ?? 0) - (orderOf.get(b) ?? 0));
  for (const child of children) {
    const parents = [...new Set(parentsOf.get(child))].sort();
    if (parents.length === 2) {
      const u = ensureUnion(parents[0], parents[1]);
      elkEdges.push({ id: `e:${u}:${child}`, sources: [u], targets: [child] });
    } else {
      for (const p of parents) elkEdges.push({ id: `e:${p}:${child}`, sources: [p], targets: [child] });
    }
  }

  const result = await elk.layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.layered.spacing.nodeNodeBetweenLayers": "56",
      "elk.spacing.nodeNode": "28",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.crossingMinimization.forceNodeModelOrder": "false",
      "elk.edgeRouting": "ORTHOGONAL",
    },
    children: elkNodes,
    edges: elkEdges,
  });

  const pos = new Map((result.children ?? []).map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]));
  const nodes: FlowNode[] = people.map((person) => ({
    id: person._id,
    type: "person",
    position: pos.get(person._id) ?? { x: 0, y: 0 },
    data: { person, focused: person._id === opts.focusId, isSelf: person._id === opts.selfId },
    width: PERSON_WIDTH,
    height: PERSON_HEIGHT,
  }));
  for (const id of unions.keys()) {
    nodes.push({
      id,
      type: "union",
      position: pos.get(id) ?? { x: 0, y: 0 },
      data: { status: unionStatus.get(id) },
      width: UNION_SIZE,
      height: UNION_SIZE,
      selectable: false,
      focusable: false,
    });
  }
  const edges: Edge[] = elkEdges.map((e) => ({
    id: e.id,
    source: e.sources[0],
    target: e.targets[0],
    type: "smoothstep",
    selectable: false,
    focusable: false,
    className: e.targets[0].startsWith("u:")
      ? `partner-edge partner-${unionStatus.get(e.targets[0]) ?? "married"}`
      : "child-edge",
  }));
  // Other parents (not laid out): dashed, labelled "asuh", "tiri", ...
  for (const x of extra) {
    edges.push({
      id: `x:${x.kind}:${x.from}:${x.child}`,
      source: x.from,
      target: x.child,
      type: "smoothstep",
      selectable: false,
      focusable: false,
      className: `child-edge link-edge link-${x.kind}`,
      label: opts.kindLabel?.(x.kind),
      labelShowBg: true,
      labelBgPadding: [4, 2],
      labelBgBorderRadius: 4,
    });
  }
  return { nodes, edges };
}
