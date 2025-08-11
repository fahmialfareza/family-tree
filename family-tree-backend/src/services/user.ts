import { CreateUserDto } from "@/dto/auth";
import { createUser } from "@/repositories/user";

export const addUser = async (data: CreateUserDto) => {
  return createUser(data);
};
