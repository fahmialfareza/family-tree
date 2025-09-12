import { TTypeID } from "./id";

export interface FamilyTreeNode {
  _id: TTypeID;
  name: string;
  gender: "male" | "female";
  children: FamilyTreeNode[];
  spouses?: Array<
    Omit<FamilyTreeNode, "spouses" | "children"> & {
      children: FamilyTreeNode[];
    }
  >;
  parents?: FamilyTreeNode[];
  attributes?: {
    relation?: "spouse" | "child" | "parent";
    gender: "male" | "female";
  };
}

export type TD3Node = {
  name: string;
  _id: string;
  gender?: string;
  attributes?: Record<string, any>;
  children: TD3Node[];
};
