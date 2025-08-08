import { Family } from "@/models";
import { TTypeID } from "@/models/types/id";

export async function getFamilies() {
  return Family.find().populate("person").lean();
}

export async function getFamilyById(id: TTypeID) {
  return Family.findById(id).populate("person").lean();
}

export async function createFamily(name: string, person: TTypeID) {
  const newFamily = new Family({
    name,
    person,
  });
  const savedPerson = await newFamily.save();
  const insertedId = savedPerson._id;

  return getFamilyById(insertedId);
}
