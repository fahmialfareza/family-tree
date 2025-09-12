import { CreateFamilyDto } from "@/dto/family";
import { Family } from "@/models";
import { TTypeID } from "@/models/types/id";

export async function getFamilies(ownedBy?: TTypeID[]) {
  const query = ownedBy ? { ownedBy: { $in: ownedBy } } : {};
  return Family.find(query).populate("person").lean();
}

export async function getFamilyById(id: TTypeID) {
  return Family.findById(id).populate("person").lean();
}

export async function getFamilyByPersonIds(personIds: TTypeID[]) {
  return Family.find({ person: { $in: personIds } }).lean();
}

export async function createFamily(data: CreateFamilyDto) {
  const newFamily = new Family(data);
  const savedPerson = await newFamily.save();
  const insertedId = savedPerson._id as TTypeID;

  return getFamilyById(insertedId);
}

export async function updateFamilyOwnership(
  familyIds: TTypeID[],
  owners: TTypeID[]
) {
  return Family.updateMany(
    { _id: { $in: familyIds } },
    { $set: { ownedBy: owners } }
  );
}

export async function deleteFamily(id: TTypeID) {
  return Family.delete({ _id: id });
}
