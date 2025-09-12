import { TPerson } from "./person";

export type TRelationship = {
  _id: string;
  from: string;
  to: string;
  order?: number;
  type: "parent" | "spouse" | "child";

  fromDetails?: TPerson;
  toDetails?: TPerson;
};
