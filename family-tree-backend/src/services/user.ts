import { IUser } from "@/models/user";
import { createUser } from "@/repositories/user";

export const addUser = async (data: IUser) => {
  return createUser(data);
};
