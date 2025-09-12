import { CreatePersonDto, UpdatePersonDto } from "@/dto/person";
import { error } from "@/middlewares/errorHandler";
import { TTypeID } from "@/models/types/id";
import {
  getAllPeople,
  getPersonById,
  createPerson,
  updatePerson,
  deletePersonById,
  updatePersonOwnership,
} from "@/repositories/person";
import { uploadImage } from "@/utils/cloudinary";
import { buildFamilyTree } from "./treeBuilder";
import { FamilyTreeNode } from "@/models/types/familyTree";
import {
  getFamilyByPersonIds,
  updateFamilyOwnership,
} from "@/repositories/family";

export async function findAllPeople(ownedBy?: TTypeID[]) {
  return getAllPeople(ownedBy);
}

export async function findPersonById(id: TTypeID) {
  const person = await getPersonById(id);
  if (!person) {
    throw error("Person not found", 404);
  }
  return person;
}

export const addPerson = async (person: CreatePersonDto) => {
  let newPerson = await createPerson(person);
  if (!newPerson) {
    throw error("Failed to create person");
  }

  if (person.photo) {
    const photoUrl = await uploadImage(person.photo);
    if (!photoUrl) {
      throw error("Failed to upload photo");
    }
    person.photoUrl = photoUrl;
    newPerson = await createPerson(person);
  }

  return newPerson;
};

export const editPerson = async (person: UpdatePersonDto) => {
  let updatedPerson = await updatePerson(person);
  if (!updatedPerson) {
    throw error("Failed to update person");
  }

  if (person.photo) {
    const photoUrl = await uploadImage(person.photo);
    if (!photoUrl) {
      throw error("Failed to upload photo");
    }
    person.photoUrl = photoUrl;
    updatedPerson = await updatePerson(person);
  }

  return updatedPerson;
};

function collectIdsFromTree(node: FamilyTreeNode): TTypeID[] {
  let ids: TTypeID[] = [];
  if (node._id) {
    ids.push(node._id);
  }
  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      ids = ids.concat(collectIdsFromTree(child));
    }
  }
  return ids;
}

export const editOwnership = async (personId: TTypeID, ownedBy: TTypeID[]) => {
  const children = await buildFamilyTree(personId, true);
  const parents = await buildFamilyTree(personId, false, true);

  const childrenIds =
    children && children.children
      ? children.children.flatMap((child) => collectIdsFromTree(child))
      : [];

  const parentIds =
    parents && parents.children
      ? parents.children.flatMap((parent) => collectIdsFromTree(parent))
      : [];

  const allPeople = [personId, ...parentIds, ...childrenIds];
  const families = await getFamilyByPersonIds(allPeople);
  const familyIds = families.map((family) => family._id as TTypeID);

  const [updatedPerson, updatedFamilies] = await Promise.all([
    updatePersonOwnership(allPeople, ownedBy),
    updateFamilyOwnership(familyIds, ownedBy),
  ]);
  if (!updatedPerson || !updatedFamilies) {
    throw error("Failed to update person ownership");
  }

  return true;
};

export const removePersonById = async (id: TTypeID) => {
  const deletedPerson = await deletePersonById(id);
  if (!deletedPerson) {
    throw error("Failed to delete person");
  }

  return deletedPerson;
};
