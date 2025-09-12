import {
  CreateRelationshipDto,
  UpdateRelationshipDto,
  UpsertRelationshipDto,
} from "@/dto/relationship";
import { TTypeID } from "@/models/types/id";
import { insertManyRelationships } from "@/repositories/relationship";
import {
  getRelationshipsByPersonId,
  updateRelationship,
  deleteRelationships,
} from "@/repositories/relationship";

export const findRelationshipByPersonId = async (personId: TTypeID) => {
  const relationships = await getRelationshipsByPersonId(personId);

  return relationships.filter(
    (rel) => rel.from.toString() === personId.toString()
  );
};

export const upsertRelationships = async (
  personId: TTypeID,
  relationships: UpsertRelationshipDto[]
) => {
  const existing = await getRelationshipsByPersonId(personId);

  const existingMap = new Map<string, UpdateRelationshipDto>();
  for (const rel of existing) {
    existingMap.set(`${rel.from}_${rel.to}_${rel.type}`, {
      ...rel,
      _id: rel._id as TTypeID,
    });
  }

  const toInsert: CreateRelationshipDto[] = [];
  const toUpdate: UpdateRelationshipDto[] = [];
  const seenKeys = new Set<string>();

  for (const rel of relationships) {
    if (!rel.to || !rel.type) continue;

    const key = `${personId}_${rel.to}_${rel.type}`;
    seenKeys.add(key);

    if (!existingMap.has(key)) {
      toInsert.push({
        from: personId,
        to: rel.to,
        type: rel.type,
        order: rel.order,
      });
    } else {
      const existingRel = existingMap.get(key)!;
      if (existingRel.order !== rel.order) {
        toUpdate.push({
          _id: existingRel._id,
          from: personId,
          to: rel.to,
          type: rel.type,
          order: rel.order,
        });
      }
    }

    let inverseType: "parent" | "child" | "spouse" | undefined;
    if (rel.type === "parent") inverseType = "child";
    else if (rel.type === "child") inverseType = "parent";
    else if (rel.type === "spouse") inverseType = "spouse";

    if (inverseType) {
      const invKey = `${rel.to}_${personId}_${inverseType}`;
      seenKeys.add(invKey);

      if (!existingMap.has(invKey)) {
        toInsert.push({
          from: rel.to,
          to: personId,
          type: inverseType,
          order: rel.order,
        });
      } else {
        const existingInvRel = existingMap.get(invKey)!;
        toUpdate.push({
          _id: existingInvRel._id,
          from: rel.to,
          to: personId,
          type: inverseType,
          order: rel.order,
        });
      }
    }
  }

  const toDelete = existing.filter((rel) => {
    const key = `${rel.from}_${rel.to}_${rel.type}`;
    return !seenKeys.has(key);
  });

  if (toInsert.length) await insertManyRelationships(toInsert);
  for (const rel of toUpdate) await updateRelationship(rel);
  if (toDelete.length)
    await deleteRelationships(toDelete.map((rel) => rel._id as TTypeID));

  return {
    inserted: toInsert.length,
    updated: toUpdate.length,
    deleted: toDelete.length,
  };
};
