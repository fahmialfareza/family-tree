import { CreatePersonDto, UpdatePersonDto } from "@/dto/person";
import { error } from "@/middlewares/errorHandler";
import { TTypeID } from "@/models/types/id";
import {
  getAllPeople,
  getPersonById,
  createPerson,
  updatePerson,
  deletePersonById,
} from "@/repositories/person";
import { uploadImage } from "@/utils/cloudinary";

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

export const removePersonById = async (id: TTypeID) => {
  const deletedPerson = await deletePersonById(id);
  if (!deletedPerson) {
    throw error("Failed to delete person");
  }

  return deletedPerson;
};
