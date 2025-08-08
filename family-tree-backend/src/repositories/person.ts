import { IPerson } from "@/models/person";
import { Person } from "@/models";
import { TTypeID } from "@/models/types/id";

export async function getAllPeople() {
  return Person.find().lean();
}

export async function getPersonById(id: TTypeID) {
  return Person.findById(id).lean();
}

export async function createPerson(person: IPerson) {
  const newPerson = new Person(person);
  const savedPerson = await newPerson.save();
  const insertedId = savedPerson._id;

  return getPersonById(insertedId);
}
