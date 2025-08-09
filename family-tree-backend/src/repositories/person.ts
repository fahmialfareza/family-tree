import { IPerson } from "@/models/person";
import { Family, Person } from "@/models";
import { TTypeID } from "@/models/types/id";

export async function getAllPeople(ownedBy?: TTypeID) {
  const query: any = {};
  if (ownedBy) {
    query.ownedBy = ownedBy;
  }
  return Person.find(query).lean();
}

export async function getPersonById(id: TTypeID) {
  return Person.findById(id).lean();
}

export async function createPerson(person: IPerson) {
  const newPerson = new Person(person);
  const savedPerson = await newPerson.save();
  const insertedId = savedPerson._id as TTypeID;

  return getPersonById(insertedId);
}

export async function updatePerson(person: IPerson & { _id: TTypeID }) {
  return Person.findByIdAndUpdate(person._id, person, { new: true }).lean();
}

export async function deletePersonById(id: TTypeID) {
  await Family.delete({ person: id });
  return Person.delete({ _id: id });
}
