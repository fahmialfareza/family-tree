import { error } from "@/middlewares/errorHandler";
import { IPerson } from "@/models/person";
import { TTypeID } from "@/models/types/id";
import {
  getAllPeople,
  getPersonById,
  createPerson,
  updatePerson,
  deletePersonById,
} from "@/repositories/person";

export async function findAllPeople(ownedBy?: TTypeID) {
  return getAllPeople(ownedBy);
}

export async function findPersonById(id: TTypeID) {
  const person = await getPersonById(id);
  if (!person) {
    throw error("Person not found", 404);
  }
  return person;
}

export const addPerson = async (person: IPerson) => {
  const newPerson = await createPerson(person);
  if (!newPerson) {
    throw error("Failed to create person");
  }

  // const relationshipDocs: IRelationship[] = [];
  // for (const rel of relationships) {
  //   if (!rel.to || !rel.type) continue;

  //   relationshipDocs.push({
  //     from: newPerson._id,
  //     to: rel.to,
  //     type: rel.type,
  //     order: rel.order,
  //   });

  //   if (rel.type === "parent") {
  //     relationshipDocs.push({
  //       from: rel.to,
  //       to: newPerson._id,
  //       type: "child",
  //       order: rel.order,
  //     });
  //   } else if (rel.type === "spouse") {
  //     relationshipDocs.push({
  //       from: rel.to,
  //       to: newPerson._id,
  //       type: "spouse",
  //       order: rel.order,
  //     });
  //   } else if (rel.type === "child") {
  //     relationshipDocs.push({
  //       from: rel.to,
  //       to: newPerson._id,
  //       type: "parent",
  //       order: rel.order,
  //     });
  //   }
  // }

  // await insertManyRelationships(relationshipDocs);

  return newPerson;
};

export const editPerson = async (person: IPerson & { _id: TTypeID }) => {
  const updatedPerson = await updatePerson(person);
  if (!updatedPerson) {
    throw error("Failed to update person");
  }

  return updatedPerson;
};

export const removePersonById = async (id: TTypeID) => {
  const deletedPerson = await deletePersonById(id);
  if (!deletedPerson) {
    throw error("Failed to delete person");
  }

  return deletedPerson;
};
