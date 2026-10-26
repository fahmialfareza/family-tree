import type { Graph, ImportScope } from "@/lib/api/types";

/**
 * People in a branch of the tree, the same selection the API uses for copying and exporting
 * (selectBranch in apps/backend-go/internal/import.go): descendants come with their partners, ancestors
 * go straight up, "nearby" is everyone within `steps` parent/child/partner links.
 */
export function selectBranch(graph: Graph, root: string, scope: ImportScope, steps = 2): Set<string> {
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  const partners = new Map<string, string[]>();
  const push = (m: Map<string, string[]>, k: string, v: string) => m.set(k, [...(m.get(k) ?? []), v]);
  for (const pc of graph.parentChild) {
    push(parents, pc.child, pc.parent);
    push(children, pc.parent, pc.child);
  }
  for (const u of graph.unions) {
    push(partners, u.partners[0], u.partners[1]);
    push(partners, u.partners[1], u.partners[0]);
  }
  const seen = new Set<string>([root]);
  const add = (id: string) => (seen.has(id) ? false : (seen.add(id), true));

  const down = () => {
    const line = [root];
    while (line.length) {
      const id = line.shift()!;
      for (const p of partners.get(id) ?? []) add(p);
      for (const c of children.get(id) ?? []) if (add(c)) line.push(c);
    }
  };
  const up = () => {
    const line = [root];
    while (line.length) {
      const id = line.shift()!;
      for (const p of parents.get(id) ?? []) if (add(p)) line.push(p);
    }
  };
  if (scope === "descendants") down();
  else if (scope === "ancestors") up();
  else if (scope === "both") {
    up();
    down();
  } else {
    let frontier = [root];
    for (let d = 0; d < steps && frontier.length; d++) {
      const next: string[] = [];
      for (const id of frontier)
        for (const n of [...(parents.get(id) ?? []), ...(children.get(id) ?? []), ...(partners.get(id) ?? [])]) if (add(n)) next.push(n);
      frontier = next;
    }
  }
  return seen;
}

export const BRANCH_SCOPES: ImportScope[] = ["descendants", "ancestors", "both", "nearby"];

export function isBranchScope(v: string | null): v is ImportScope {
  return !!v && (BRANCH_SCOPES as string[]).includes(v);
}
