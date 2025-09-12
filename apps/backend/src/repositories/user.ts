import { CreateUserDto } from "@/dto/auth";
import { User } from "@/models";
import { TTypeID } from "@/models/types/id";
import { IUser } from "@/models/user";
import { FilterQuery } from "mongoose";

export const findUsers = async (query: FilterQuery<IUser>) => {
  return User.find(query).lean();
};

export const findUserById = async (id: TTypeID) => {
  return User.findById(id).lean();
};

export const findUserByUsername = async (username: TTypeID) => {
  return User.findOne({ username }).lean();
};

export const createUser = async (data: CreateUserDto) => {
  const user = await User.create(data);
  return findUserById(user._id as TTypeID);
};
