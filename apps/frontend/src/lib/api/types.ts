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
  role: "admin" | "user";
}

export interface Tree {
  _id: string;
  name: string;
  branchScoped: boolean;
  role?: TreeRole;
  createdAt: string;
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
