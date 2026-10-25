// Shapes returned by the Go API (apps/backend-go). Responses are wrapped as {status, data} or {status, message}.

export type TreeRole = "owner" | "editor" | "viewer";
export type Gender = "male" | "female" | "other" | "unknown";
export type LifeStatus = "alive" | "deceased";
export type DatePrecision = "day" | "month" | "year";
export type DateQualifier = "exact" | "about" | "before" | "after";

export interface User {
  _id: string;
  name: string;
  username?: string;
  email?: string;
  emailVerified: boolean;
  hasPassword: boolean;
  googleLinked: boolean;
  appleLinked?: boolean;
  /** Interface language chosen on the account; absent until the user picks one. */
  locale?: "en" | "id";
  role: "admin" | "user";
}

export interface Tree {
  _id: string;
  name: string;
  branchScoped: boolean;
  /** Owner's switch for the AI assistant; assistantAvailable means the server has an AI provider. */
  assistantEnabled?: boolean;
  assistantAvailable?: boolean;
  role?: TreeRole;
  createdAt: string;
}

export interface AssistantTurn {
  role: "user" | "assistant";
  content: string;
}

/** A change the assistant proposes; nothing happens until the user applies it (lib/assistant-actions.ts). */
export interface AssistantAction {
  id: string;
  type: "add_person" | "update_person" | "add_relationship" | "add_family" | "rename_family";
  personId?: string;
  personName?: string;
  /** add_person / add_relationship: the person becomes relativeName's relation. */
  relativeId?: string;
  relativeName?: string;
  relation?: "parent" | "child" | "partner";
  otherParentId?: string;
  otherParentName?: string;
  familyId?: string;
  familyName?: string;
  fields?: AssistantPersonFields;
}

export interface AssistantPersonFields {
  name?: string;
  nickname?: string;
  gender?: Gender;
  status?: LifeStatus;
  birthDate?: string;
  birthDateQualifier?: DateQualifier;
  birthPlace?: string;
  deathDate?: string;
  deathDateQualifier?: DateQualifier;
  deathPlace?: string;
  address?: string;
  notes?: string;
}

export interface AssistantAnswer {
  answer: string;
  people: { id: string; name: string }[];
  model: string;
  actions: AssistantAction[];
}

export interface Me {
  user: User;
  trees: Tree[];
}

export interface TokenPair {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken?: string;
  user: User;
}

export interface Relationship {
  _id: string;
  from: string;
  to: string;
  type: "parent" | "child" | "spouse";
  order?: number;
  toDetails?: Person;
}

export interface Person {
  _id: string;
  treeId?: string;
  name: string;
  nickname?: string;
  address?: string;
  status: LifeStatus;
  gender: Gender;
  birthDate?: string;
  birthDatePrecision?: DatePrecision;
  birthDateQualifier?: DateQualifier;
  deathDate?: string;
  deathDatePrecision?: DatePrecision;
  deathDateQualifier?: DateQualifier;
  birthPlace?: string;
  deathPlace?: string;
  notes?: string;
  phone?: string;
  photoUrl?: string;
  ownedBy: string[] | null;
  owners?: User[];
  /** Set when the person was copied from another tree; tree details only for members of that tree. */
  copiedFrom?: { treeId?: string; treeName?: string; personId?: string; canUpdate: boolean };
  relationships?: Relationship[];
}

export interface GraphPerson {
  _id: string;
  name: string;
  nickname?: string;
  gender: Gender;
  status: LifeStatus;
  birthDate?: string;
  birthDatePrecision?: DatePrecision;
  deathDate?: string;
  deathDatePrecision?: DatePrecision;
  photoUrl?: string;
  canEdit: boolean;
}

export interface Graph {
  tree: { _id: string; name: string; role: TreeRole; branchScoped: boolean };
  people: GraphPerson[];
  unions: { _id: string; partners: [string, string] }[];
  parentChild: { parent: string; child: string; order?: number }[];
}

export interface Family {
  _id: string;
  treeId?: string;
  name: string;
  person?: Person;
  ownedBy: string[];
}

export interface TreeMember {
  userId: string;
  name: string;
  username?: string;
  email?: string;
  role: TreeRole;
  joinedAt: string;
}

export interface TreeInvite {
  _id: string;
  treeId: string;
  email: string;
  role: TreeRole;
  expiresAt: string;
  createdAt: string;
}

export interface Session {
  _id: string;
  userAgent: string;
  ip: string;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export type ImportScope = "descendants" | "ancestors" | "both" | "nearby";

export interface ImportRequest {
  sourceTreeId: string;
  personId: string;
  scope: ImportScope;
  steps?: number;
  updateExisting?: boolean;
  dryRun?: boolean;
}

export interface ImportResult {
  people?: { _id: string; name: string; birthDate?: string; deathDate?: string; alreadyInTree: boolean }[];
  created: number;
  reused: number;
  updated: number;
  links: number;
  skipped: number;
  selected: number;
  rootId?: string;
  dryRun: boolean;
}

export interface DayCount {
  date: string;
  count: number;
}

/** GET /api/admin/overview (platform admins only). */
export interface AdminOverview {
  generatedAt: string;
  users: { total: number; verified: number; pending: number; google: number; apple: number; new7d: number; new30d: number; prev30d: number; active1d: number; active7d: number; active30d: number };
  trees: { total: number; assistantEnabled: number; branchScoped: number; new30d: number };
  content: { people: number; families: number; relationships: number; photos: number; peopleNew30d: number };
  signups: DayCount[];
  peopleAdded: DayCount[];
  recentUsers: { id: string; name: string; email?: string; username?: string; emailVerified: boolean; signIn: "google" | "apple" | "password"; trees: number; createdAt: string; lastActiveAt?: string }[];
  largestTrees: { id: string; name: string; people: number; members: number; assistant: boolean; createdAt: string }[];
  system: { database: string; redis: "ok" | "error" | "off"; email: boolean; google: boolean; apple: boolean; aiProviders: string[]; version?: string };
}
