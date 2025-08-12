import { CreateFamilyDto } from "@/dto/family";
import { TTypeID } from "@/models/types/id";
import { createFamily, deleteFamily, getFamilies } from "@/repositories/family";
import { getPersonById } from "@/repositories/person";

export const getAllFamilies = async (ownedBy?: TTypeID[]) => {
  return getFamilies(ownedBy);
};

export const addFamily = async (data: CreateFamilyDto) => {
  const person = await getPersonById(data.person!);
  if (!person) {
    throw new Error("Person not found");
  }

  return createFamily(data);
};

export const removeFamily = async (id: TTypeID) => {
  return deleteFamily(id);
};
