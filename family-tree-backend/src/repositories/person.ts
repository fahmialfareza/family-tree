import { Family, Person } from "@/models";
import { TTypeID } from "@/models/types/id";
import { CreatePersonDto, UpdatePersonDto } from "@/dto/person";

export async function getAllPeople(ownedBy?: TTypeID[]) {
  const query: any = {};
  if (ownedBy) {
    query.ownedBy = { $in: ownedBy };
  }
  return Person.find(query)
    .populate([
      {
        path: "relationships",
        match: { from: "$$CURRENT._id" },
        populate: {
          path: "toDetails",
        },
      },
    ])
    .lean();
}

export async function getPersonById(id: TTypeID) {
  return Person.findById(id)
    .populate([
      {
        path: "relationships",
        match: { from: "$$CURRENT._id" },
        populate: {
          path: "toDetails",
        },
      },
      {
        path: "owners",
      },
    ])
    .lean();
}

export async function createPerson(person: CreatePersonDto) {
  const newPerson = new Person(person);
  const savedPerson = await newPerson.save();
  const insertedId = savedPerson._id as TTypeID;

  return getPersonById(insertedId);
}

export async function updatePerson(person: UpdatePersonDto) {
  return Person.findByIdAndUpdate(person._id, person, { new: true }).lean();
}

export async function updatePersonOwnership(
  personIds: TTypeID[],
  owners: TTypeID[]
) {
  return Person.updateMany(
    { _id: { $in: personIds } },
    { $set: { ownedBy: owners } }
  );
}

export async function deletePersonById(id: TTypeID) {
  await Family.delete({ person: id });
  return Person.delete({ _id: id });
}
