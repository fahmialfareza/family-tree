import { IRelationship } from "@/models/relationship";
import { Relationship } from "@/models";
import { TTypeID } from "@/models/types/id";

export async function getRelationshipsByPersonId(personId: TTypeID) {
  return Relationship.find({
    $or: [{ from: personId }, { to: personId }],
  }).lean();
}

export async function insertManyRelationships(relationships: IRelationship[]) {
  return Relationship.insertMany(relationships);
}
