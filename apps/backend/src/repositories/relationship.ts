import { Relationship } from "@/models";
import { TTypeID } from "@/models/types/id";
import {
  CreateRelationshipDto,
  UpdateRelationshipDto,
} from "@/dto/relationship";

export async function getRelationshipsByPersonId(personId: TTypeID) {
  return Relationship.find({
    $or: [{ from: personId }, { to: personId }],
  })
    .populate("fromDetails toDetails")
    .lean();
}

export async function insertManyRelationships(
  relationships: CreateRelationshipDto[]
) {
  return Relationship.insertMany(relationships);
}

export async function updateRelationship(updates: UpdateRelationshipDto) {
  return Relationship.findByIdAndUpdate(updates._id, updates, {
    new: true,
  }).lean();
}

export async function deleteRelationships(ids: TTypeID[]) {
  return Relationship.delete({ _id: { $in: ids } });
}
