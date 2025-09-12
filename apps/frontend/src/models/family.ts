import { TPerson } from "./person";

export type TFamily = {
  _id: string;
  name: string;
  person: string | TPerson;
};
