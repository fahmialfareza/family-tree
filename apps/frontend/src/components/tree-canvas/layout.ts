import ELK, { type ElkExtendedEdge, type ElkNode } from "elkjs/lib/elk.bundled.js";
import type { Edge, Node } from "@xyflow/react";
import type { Graph, GraphPerson, ParentKind, PartnerStatus } from "@/lib/api/types";

// Genealogy layout on top of ELK's layered (Sugiyama) algorithm.
//
// Partners are laid out as one block: everyone joined by marriage (including earlier, divorced ones, and
// co-parents who never married) sits side by side, in chain order, so someone who remarried stands between
// their partners (Joyo, Wati, Slamet, Lastri) and the couple lines never cross other people. ELK places the
// blocks (generations as layers, fewest crossings); the people, and a small "union" dot under each couple, are
// then placed inside their block. Children hang below their parents' dot.
//
// A child can also have parents of other kinds (adoptive, step, foster, guardian, milk). Only the primary set
// is laid out: birth parents when recorded, else adoptive, else whatever exists. The other links are returned
// as hidden edges (the canvas shows them for the person in focus) and as a mark on the child's card.

export const PERSON_WIDTH = 208;
export const PERSON_HEIGHT = 72;
const UNION_SIZE = 10;
const PARTNER_GAP = 28; // between partners in a block
const UNION_DROP = 26; // union dot below the cards

export type PersonNodeData = {
  person: GraphPerson;
  focused: boolean;
  isSelf: boolean;
  /** Kinds of this person's non-primary parents (e.g. foster), shown as a small mark on the card. */
  otherParents?: Exclude<ParentKind, "birth">[];
};
export type PersonFlowNode = Node<PersonNodeData, "person">;
export type UnionFlowNode = Node<{ status?: PartnerStatus }, "union">;
export type FlowNode = PersonFlowNode | UnionFlowNode;
/** Data on the dashed edges of non-primary parents; `people` are the ids involved, to decide when to show it. */
export type LinkEdgeData = { people: string[] };

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

/**
 * Orders a group of partners so each stands next to their partners where possible: a chain (A–B–C–D) is walked
 * from one end; someone with several partners stands in the middle of them.
 */
function chainOrder(members: string[], adj: Map<string, Set<string>>): string[] {
  const degree = (id: string) => adj.get(id)?.size ?? 0;
  if (members.length <= 2) return [...members].sort();
  const hubs = members.filter((id) => degree(id) > 2);
  if (hubs.length === 0) {
    // A path (or a ring): start at an end and walk.
    const start = members.find((id) => degree(id) === 1) ?? [...members].sort()[0];
    const order = [start];
    const seen = new Set(order);
    for (let cur = start; ; ) {
      const next = [...(adj.get(cur) ?? [])].sort().find((n) => !seen.has(n));
      if (!next) break;
      order.push(next);
      seen.add(next);
      cur = next;
    }
    return [...order, ...members.filter((id) => !seen.has(id)).sort()];
  }
  // Someone with three or more partners: half of them on each side, the rest of the group after them.
  const hub = hubs.sort((a, b) => degree(b) - degree(a))[0];
  const around = [...(adj.get(hub) ?? [])].sort();
  const left = around.slice(0, Math.floor(around.length / 2));
  const order = [...left, hub, ...around.slice(left.length)];
  const seen = new Set(order);
  return [...order, ...members.filter((id) => !seen.has(id)).sort()];
}

export async function layoutGraph(
  graph: Graph,
  visible: Set<string>,
  opts: { focusId?: string; selfId?: string },
): Promise<{ nodes: FlowNode[]; edges: Edge[] }> {
  const people = graph.people.filter((p) => visible.has(p._id));
  const unionStatus = new Map(graph.unions.map((u) => [unionId(u.partners[0], u.partners[1]), u.status]));

  // Each child's visible parents by kind; the primary set is laid out, the rest drawn on demand.
  const linksOf = new Map<string, Map<ParentKind, string[]>>();
  const orderOf = new Map<string, number>();
  for (const pc of [...graph.parentChild].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    if (!visible.has(pc.parent) || !visible.has(pc.child)) continue;
    const byKind = linksOf.get(pc.child) ?? new Map<ParentKind, string[]>();
    const kind = pc.kind ?? "birth";
    byKind.set(kind, [...new Set([...(byKind.get(kind) ?? []), pc.parent])]);
    linksOf.set(pc.child, byKind);
    if (!orderOf.has(pc.child)) orderOf.set(pc.child, pc.order ?? 0);
  }
  const primaryParents = new Map<string, string[]>();
  const otherParents = new Map<string, Exclude<ParentKind, "birth">[]>();
  const extra: { parents: string[]; child: string; kind: Exclude<ParentKind, "birth"> }[] = [];
  for (const [child, byKind] of linksOf) {
    const primary: ParentKind = byKind.has("birth") ? "birth" : byKind.has("adopted") ? "adopted" : [...byKind.keys()][0];
    primaryParents.set(child, [...byKind.get(primary)!].sort());
    for (const [kind, parents] of byKind) {
      if (kind === primary || kind === "birth") continue;
      otherParents.set(child, [...(otherParents.get(child) ?? []), kind]);
      extra.push({ parents: [...parents].sort(), child, kind });
    }
  }

  // Partner groups: unions, plus co-parents who aren't partners (they still share a dot over their children).
  const couples = new Set<string>();
  const adj = new Map<string, Set<string>>();
  const pair = (a: string, b: string) => {
    if (a === b || !visible.has(a) || !visible.has(b)) return;
    couples.add(unionId(a, b));
    adj.set(a, (adj.get(a) ?? new Set()).add(b));
    adj.set(b, (adj.get(b) ?? new Set()).add(a));
  };
  for (const u of graph.unions) pair(u.partners[0], u.partners[1]);
  for (const parents of primaryParents.values()) if (parents.length === 2) pair(parents[0], parents[1]);

  const blockOf = new Map<string, string>();
  const blocks = new Map<string, string[]>();
  for (const p of people) {
    if (blockOf.has(p._id)) continue;
    const members: string[] = [];
    const stack = [p._id];
    blockOf.set(p._id, "");
    while (stack.length) {
      const id = stack.pop()!;
      members.push(id);
      for (const n of adj.get(id) ?? []) {
        if (!blockOf.has(n)) {
          blockOf.set(n, "");
          stack.push(n);
        }
      }
    }
    const order = chainOrder(members, adj);
    const id = `b:${order[0]}`;
    blocks.set(id, order);
    for (const m of order) blockOf.set(m, id);
  }

  // ELK lays out blocks; an edge from the parents' block to the child's block keeps generations apart.
  const elkNodes: ElkNode[] = [...blocks].map(([id, members]) => ({
    id,
    width: members.length * PERSON_WIDTH + (members.length - 1) * PARTNER_GAP,
    height: PERSON_HEIGHT,
  }));
  const elkEdges: ElkExtendedEdge[] = [];
  const blockEdges = new Set<string>();
  const children = [...primaryParents.keys()].sort((a, b) => (orderOf.get(a) ?? 0) - (orderOf.get(b) ?? 0));
  for (const child of children) {
    const from = blockOf.get(primaryParents.get(child)![0])!;
    const to = blockOf.get(child)!;
    const id = `be:${from}:${to}`;
    if (from !== to && !blockEdges.has(id)) {
      blockEdges.add(id);
      elkEdges.push({ id, sources: [from], targets: [to] });
    }
  }

  const result = await elk.layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.layered.spacing.nodeNodeBetweenLayers": "84",
      "elk.spacing.nodeNode": "36",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.crossingMinimization.forceNodeModelOrder": "false",
      "elk.edgeRouting": "ORTHOGONAL",
    },
    children: elkNodes,
    edges: elkEdges,
  });

  // People inside their block, in chain order.
  const pos = new Map<string, { x: number; y: number }>();
  for (const b of result.children ?? []) {
    blocks.get(b.id)!.forEach((id, i) => pos.set(id, { x: (b.x ?? 0) + i * (PERSON_WIDTH + PARTNER_GAP), y: b.y ?? 0 }));
  }
  const nodes: FlowNode[] = people.map((person) => ({
    id: person._id,
    type: "person",
    position: pos.get(person._id) ?? { x: 0, y: 0 },
    data: {
      person,
      focused: person._id === opts.focusId,
      isSelf: person._id === opts.selfId,
      otherParents: otherParents.get(person._id),
    },
    width: PERSON_WIDTH,
    height: PERSON_HEIGHT,
  }));

  // A dot under each couple, between the two partners.
  const edges: Edge[] = [];
  const edge = (id: string, source: string, target: string, className: string): Edge => ({
    id,
    source,
    target,
    type: "smoothstep",
    selectable: false,
    focusable: false,
    className,
  });
  const unionAt = new Map<string, { x: number; y: number }>();
  for (const uid of couples) {
    const [, a, b] = uid.split(":");
    const pa = pos.get(a);
    const pb = pos.get(b);
    if (!pa || !pb) continue;
    const at = { x: (pa.x + pb.x + PERSON_WIDTH - UNION_SIZE) / 2, y: Math.max(pa.y, pb.y) + PERSON_HEIGHT + UNION_DROP };
    unionAt.set(uid, at);
    nodes.push({
      id: uid,
      type: "union",
      position: at,
      data: { status: unionStatus.get(uid) },
      width: UNION_SIZE,
      height: UNION_SIZE,
      selectable: false,
      focusable: false,
    });
    const cls = `partner-edge partner-${unionStatus.get(uid) ?? "married"}`;
    edges.push(edge(`e:${a}:${uid}`, a, uid, cls), edge(`e:${b}:${uid}`, b, uid, cls));
  }

  // Children from their parents' dot (or the one parent).
  for (const child of children) {
    const parents = primaryParents.get(child)!;
    if (parents.length === 2 && unionAt.has(unionId(parents[0], parents[1]))) {
      const uid = unionId(parents[0], parents[1]);
      edges.push(edge(`e:${uid}:${child}`, uid, child, "child-edge"));
    } else {
      for (const p of parents) edges.push(edge(`e:${p}:${child}`, p, child, "child-edge"));
    }
  }

  // Other parents: dashed (the child's card says "asuh", "tiri", ...); hidden until one of these people is in focus.
  for (const x of extra) {
    const uid = x.parents.length === 2 ? unionId(x.parents[0], x.parents[1]) : "";
    const sources = uid && unionAt.has(uid) ? [uid] : x.parents;
    for (const source of sources) {
      edges.push({
        ...edge(`x:${x.kind}:${source}:${x.child}`, source, x.child, `child-edge link-edge link-${x.kind}`),
        hidden: true,
        data: { people: [...x.parents, x.child] } satisfies LinkEdgeData,
      });
    }
  }
  return { nodes, edges };
}
