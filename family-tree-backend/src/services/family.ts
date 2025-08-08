import { TTypeID } from "@/models/types/id";
import { createFamily, getFamilies } from "@/repositories/family";
import { getPersonById } from "@/repositories/person";

export const getAllFamilies = async () => {
  return getFamilies();
};

export const addFamily = async (name: string, personId: TTypeID) => {
  const person = await getPersonById(personId);
  if (!person) {
    throw new Error("Person not found");
  }

  return createFamily(name, personId);
};
