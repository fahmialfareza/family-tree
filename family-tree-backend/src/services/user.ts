import { CreateUserDto } from "@/dto/auth";
import { IUser } from "@/models/user";
import { createUser, findUsers } from "@/repositories/user";
import { FilterQuery } from "mongoose";

export const addUser = async (data: CreateUserDto) => {
  return createUser(data);
};

export const getUsers = async (query: FilterQuery<IUser>) => {
  return findUsers(query);
};
