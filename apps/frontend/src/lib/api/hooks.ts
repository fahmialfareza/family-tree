"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dateParts, partsToValue } from "@/lib/format";
import { api } from "./client";
import type {
  AssistantAnswer,
  AssistantTurn,
  DatePrecision,
  DateQualifier,
  Family,
  ImportRequest,
  ImportResult,
  Graph,
  Me,
  Page,
  ParentKind,
  PartnerStatus,
  Person,
  Relationship,
  Session,
  Tree,
  TreeInvite,
  TreeInviteLink,
  TreeMember,
  TreeRole,
  User,
} from "./types";

// Query keys are scoped per tree so one tree's writes never invalidate another's data.
export const keys = {
  me: ["me"] as const,
  sessions: ["sessions"] as const,
  tree: (treeId: string) => ["tree", treeId] as const,
  graph: (treeId: string) => ["tree", treeId, "graph"] as const,
  people: (treeId: string, q: string) => ["tree", treeId, "people", q] as const,
  person: (treeId: string, id: string) => ["tree", treeId, "person", id] as const,
  relationships: (treeId: string, id: string) => ["tree", treeId, "relationships", id] as const,
  families: (treeId: string) => ["tree", treeId, "families"] as const,
  members: (treeId: string) => ["tree", treeId, "members"] as const,
  invites: (treeId: string) => ["tree", treeId, "invites"] as const,
  inviteLinks: (treeId: string) => ["tree", treeId, "invite-links"] as const,
};

const t = (treeId: string) => `/api/trees/${encodeURIComponent(treeId)}`;

export function useMe(initialData?: Me) {
  return useQuery({ queryKey: keys.me, queryFn: () => api.get<Me>("/api/me"), initialData });
}

export function useTree(treeId: string) {
  return useQuery({ queryKey: keys.tree(treeId), queryFn: () => api.get<Tree>(t(treeId)) });
}

export function useGraph(treeId: string) {
  return useQuery({ queryKey: keys.graph(treeId), queryFn: () => api.get<Graph>(`${t(treeId)}/graph`), enabled: !!treeId });
}

export function usePeoplePage(treeId: string, q: string) {
  return useQuery({
    queryKey: keys.people(treeId, q),
    queryFn: () =>
      api.get<Page<Person>>(`${t(treeId)}/people?limit=200${q ? `&q=${encodeURIComponent(q)}` : ""}`),
  });
}

export function usePerson(treeId: string, id: string | null) {
  return useQuery({
    queryKey: keys.person(treeId, id ?? ""),
    queryFn: () => api.get<Person>(`${t(treeId)}/people/${encodeURIComponent(id!)}`),
    enabled: !!id,
  });
}

export function useRelationships(treeId: string, id: string | null) {
  return useQuery({
    queryKey: keys.relationships(treeId, id ?? ""),
    queryFn: () => api.get<Relationship[]>(`${t(treeId)}/people/${encodeURIComponent(id!)}/relationships`),
    enabled: !!id,
  });
}

export function useFamilies(treeId: string) {
  return useQuery({ queryKey: keys.families(treeId), queryFn: () => api.get<Family[]>(`${t(treeId)}/families`) });
}

export function useMembers(treeId: string) {
  return useQuery({ queryKey: keys.members(treeId), queryFn: () => api.get<TreeMember[]>(`${t(treeId)}/members`) });
}

export function useInvites(treeId: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.invites(treeId),
    queryFn: () => api.get<TreeInvite[]>(`${t(treeId)}/invites`),
    enabled,
  });
}

export function useSessions() {
  return useQuery({ queryKey: keys.sessions, queryFn: () => api.get<Session[]>("/api/auth/sessions") });
}

/** Invalidates everything cached for a tree (graph, lists, people). */
export function useInvalidateTree(treeId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["tree", treeId] });
}

// ---- mutations -------------------------------------------------------------------------------------------

export function useCreateTree() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.post<Tree>("/api/trees", { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.me }),
  });
}

export function useUpdateTree(treeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name?: string; branchScoped?: boolean; assistantEnabled?: boolean }) => api.patch<Tree>(t(treeId), body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.me });
      qc.invalidateQueries({ queryKey: ["tree", treeId] });
    },
  });
}

/** Asks the tree assistant; the conversation lives on the client and is sent with each question. */
export function useAskAssistant(treeId: string) {
  return useMutation({
    mutationFn: (body: { messages: AssistantTurn[]; locale: string }) => api.post<AssistantAnswer>(`${t(treeId)}/assistant`, body),
  });
}

export function useDeleteTree(treeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<boolean>(t(treeId)),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.me }),
  });
}

export function useSavePerson(treeId: string) {
  const invalidate = useInvalidateTree(treeId);
  return useMutation({
    mutationFn: ({ id, form }: { id?: string; form: FormData }) =>
      id ? api.put<Person>(`${t(treeId)}/people/${encodeURIComponent(id)}`, form) : api.post<Person>(`${t(treeId)}/people`, form),
    onSuccess: invalidate,
  });
}

export function useDeletePerson(treeId: string) {
  const invalidate = useInvalidateTree(treeId);
  return useMutation({
    mutationFn: (id: string) => api.delete<Person>(`${t(treeId)}/people/${encodeURIComponent(id)}`),
    onSuccess: invalidate,
  });
}

/** One relationship as sent to the API; dates are "YYYY", "YYYY-MM" or "YYYY-MM-DD". */
export type RelationshipInput = {
  to: string;
  type: "parent" | "child" | "spouse";
  order?: number;
  kind?: ParentKind;
  status?: PartnerStatus;
  startDate?: string;
  startDateQualifier?: DateQualifier;
  startPlace?: string;
  endDate?: string;
  endDateQualifier?: DateQualifier;
};

const dateValue = (iso?: string, precision?: DatePrecision) => {
  const p = dateParts(iso, precision);
  return partsToValue(p.year, p.month, p.day);
};

/** A stored relationship as input, with its details, so re-saving a person's list never resets them. */
export function relationshipInput(r: Relationship): RelationshipInput {
  return {
    to: r.to,
    type: r.type,
    order: r.order,
    kind: r.kind,
    status: r.status,
    startDate: dateValue(r.startDate, r.startDatePrecision),
    startDateQualifier: r.startDateQualifier,
    startPlace: r.startPlace,
    endDate: dateValue(r.endDate, r.endDatePrecision),
    endDateQualifier: r.endDateQualifier,
  };
}

/** Replaces the full relationship list of a person (the API diffs it and keeps both directions in sync). */
export function useSaveRelationships(treeId: string) {
  const invalidate = useInvalidateTree(treeId);
  return useMutation({
    mutationFn: ({ id, relationships }: { id: string; relationships: RelationshipInput[] }) =>
      api.post(`${t(treeId)}/people/${encodeURIComponent(id)}/relationships`, relationships),
    onSuccess: invalidate,
  });
}

/**
 * Adds relationships to a person, or updates the details of ones that exist (same person and type), keeping
 * every other link as it is.
 */
export async function addRelationships(treeId: string, id: string, add: RelationshipInput[]) {
  const existing = await api.get<Relationship[]>(`${t(treeId)}/people/${encodeURIComponent(id)}/relationships`);
  // The API returns the person's rows in both directions; only their own (from = id) make up their list.
  const list: RelationshipInput[] = existing.filter((r) => r.from === id).map(relationshipInput);
  for (const rel of add) {
    const at = list.findIndex((r) => r.to === rel.to && r.type === rel.type);
    if (at >= 0) list[at] = { ...rel, order: rel.order ?? list[at].order };
    else list.push(rel);
  }
  return api.post(`${t(treeId)}/people/${encodeURIComponent(id)}/relationships`, list);
}

export function useSetOwners(treeId: string) {
  const invalidate = useInvalidateTree(treeId);
  return useMutation({
    mutationFn: ({ id, owners }: { id: string; owners: string[] }) =>
      api.put(`${t(treeId)}/people/${encodeURIComponent(id)}/ownership`, { owners }),
    onSuccess: invalidate,
  });
}

export function useCreateFamily(treeId: string) {
  const invalidate = useInvalidateTree(treeId);
  return useMutation({
    mutationFn: (body: { name: string; person: string }) => api.post<Family>(`${t(treeId)}/families`, body),
    onSuccess: invalidate,
  });
}

export function useDeleteFamily(treeId: string) {
  const invalidate = useInvalidateTree(treeId);
  return useMutation({
    mutationFn: (id: string) => api.delete(`${t(treeId)}/families/${encodeURIComponent(id)}`),
    onSuccess: invalidate,
  });
}

export function useUpdateMember(treeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: TreeRole }) =>
      api.patch(`${t(treeId)}/members/${encodeURIComponent(userId)}`, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tree", treeId] }),
  });
}

export function useRemoveMember(treeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.delete(`${t(treeId)}/members/${encodeURIComponent(userId)}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tree", treeId] });
      qc.invalidateQueries({ queryKey: keys.me });
    },
  });
}

export function useCreateInvite(treeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; role: TreeRole }) =>
      api.post<{ invite: TreeInvite; token: string }>(`${t(treeId)}/invites`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.invites(treeId) }),
  });
}

export function useRevokeInvite(treeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) => api.delete(`${t(treeId)}/invites/${encodeURIComponent(inviteId)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.invites(treeId) }),
  });
}

export function useInviteLinks(treeId: string, enabled: boolean) {
  return useQuery({ queryKey: keys.inviteLinks(treeId), queryFn: () => api.get<TreeInviteLink[]>(`${t(treeId)}/invite-links`), enabled });
}

export function useCreateInviteLink(treeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { role: "editor" | "viewer"; days: number }) =>
      api.post<{ link: TreeInviteLink; token: string }>(`${t(treeId)}/invite-links`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.inviteLinks(treeId) }),
  });
}

export function useRevokeInviteLink(treeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (linkId: string) => api.delete(`${t(treeId)}/invite-links/${encodeURIComponent(linkId)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.inviteLinks(treeId) }),
  });
}

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.patch<User>("/api/me", { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.me }),
  });
}

/** Copies a branch from another tree into treeId (dry runs are queries; see useImportPreview). */
export function useImportBranch(treeId: string) {
  const invalidate = useInvalidateTree(treeId);
  return useMutation({
    mutationFn: (body: ImportRequest) => api.post<ImportResult>(`${t(treeId)}/import`, { ...body, dryRun: false }),
    onSuccess: invalidate,
  });
}

export function useImportPreview(treeId: string, body: ImportRequest | null) {
  return useQuery({
    queryKey: ["tree", treeId, "import-preview", body],
    queryFn: () => api.post<ImportResult>(`${t(treeId)}/import`, { ...body, dryRun: true }),
    enabled: !!body,
    staleTime: 0,
  });
}

/** Pulls the original's names, dates and places into a copied person. */
export function useSyncFromOriginal(treeId: string) {
  const invalidate = useInvalidateTree(treeId);
  return useMutation({
    mutationFn: (id: string) => api.post<Person>(`${t(treeId)}/people/${encodeURIComponent(id)}/sync`),
    onSuccess: invalidate,
  });
}
