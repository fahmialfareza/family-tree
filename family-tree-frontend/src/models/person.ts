import { TRelationship } from "./relationship";
import { TUser } from "./user";

export type TPerson = {
  _id: string;
  name: string;
  nickname: string;
  status: "alive" | "deceased";
  address: string;
  gender: "male" | "female";
  birthDate: Date;
  phone?: string;
  photoUrl?: string;

  relationships?: TRelationship[];
  owners?: TUser[];
};
