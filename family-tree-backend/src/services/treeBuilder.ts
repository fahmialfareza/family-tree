import { error } from "@/middlewares/errorHandler";
import { IPerson } from "@/models/person";
import { IRelationship } from "@/models/relationship";
import { FamilyTreeNode } from "@/models/types/familyTree";
import { TTypeID } from "@/models/types/id";
import { createPerson, getPersonById } from "@/repositories/person";
import {
  getRelationshipsByPersonId,
  insertManyRelationships,
} from "@/repositories/relationship";

export const buildFamilyTree = async (
  personId: TTypeID,
  withChildren: boolean = false,
  withParent: boolean = false
): Promise<FamilyTreeNode> => {
  const person = await getPersonById(personId);
  if (!person) {
    throw new Error(`Person with id ${personId} not found`);
  }
  const relationships = await getRelationshipsByPersonId(personId);
  let familyTree: FamilyTreeNode | null = null;

  if (withChildren) {
    // Get all spouse IDs (unique)
    const spouseIds = Array.from(
      new Set(
        relationships
          .filter((rel) => rel.type === "spouse")
          .map((rel) =>
            rel.from.toString() === personId.toString()
              ? rel.to.toString()
              : rel.from.toString()
          )
      )
    );

    // Get all children IDs (unique)
    const myChildrenIds = Array.from(
      new Set(
        relationships
          .filter(
            (rel) =>
              rel.type === "parent" &&
              rel.from.toString() === personId.toString()
          )
          .map((rel) => rel.to.toString())
      )
    );

    // For each spouse, find shared children
    const spouses: Array<
      Omit<FamilyTreeNode, "spouses" | "children"> & {
        children: FamilyTreeNode[];
      }
    > = [];

    const sharedChildrenSet = new Set<string>();
    for (const spouseId of spouseIds) {
      const spouseRelationships = await getRelationshipsByPersonId(spouseId);
      const spouseChildrenIds = spouseRelationships
        .filter(
          (rel) => rel.type === "parent" && rel.from.toString() === spouseId
        )
        .map((rel) => rel.to.toString());

      // Intersection: children shared by both this person and the spouse
      const sharedChildrenIds = myChildrenIds.filter((id) =>
        spouseChildrenIds.includes(id)
      );
      sharedChildrenIds.forEach((id) => sharedChildrenSet.add(id));

      const children: FamilyTreeNode[] = [];
      for (const childId of sharedChildrenIds) {
        const childNode = await buildFamilyTree(childId, true, false);
        children.push(childNode);
      }

      const spouse = await getPersonById(spouseId);
      if (spouse) {
        // Avoid duplicate spouse entries
        if (!spouses.some((s) => s._id.toString() === spouse._id.toString())) {
          spouses.push({
            _id: spouse._id as TTypeID,
            name: spouse.name,
            gender: spouse.gender,
            children,
          });
        }
      }
    }

    // Children not associated with any spouse (single parent)
    const singleParentChildrenIds = myChildrenIds.filter(
      (id) => !sharedChildrenSet.has(id)
    );
    const children: FamilyTreeNode[] = [];
    for (const childId of singleParentChildrenIds) {
      const childNode = await buildFamilyTree(childId, true, false);
      children.push(childNode);
    }

    familyTree = {
      _id: person._id as TTypeID,
      name: person.name,
      gender: person.gender,
      attributes: {
        gender: person.gender,
      },
      children,
      spouses,
    };

    return transformToD3Tree(familyTree);
  }

  if (withParent) {
    // Make tree to find parents
    const parentIds = Array.from(
      new Set(
        relationships
          .filter(
            (rel) =>
              rel.type === "parent" && rel.to.toString() === personId.toString()
          )
          .map((rel) => rel.from.toString())
      )
    );

    const parents: FamilyTreeNode[] = [];
    for (const parentId of parentIds) {
      const parentNode = await buildFamilyTree(parentId, false, true);
      parents.push(parentNode);
    }

    familyTree = {
      _id: person._id as TTypeID,
      name: person.name,
      gender: person.gender,
      attributes: {
        gender: person.gender,
      },
      parents,
      children: [],
    };

    return transformToD3Tree(familyTree);
  }

  return {
    _id: person._id as TTypeID,
    name: person.name,
    gender: person.gender,
    children: [],
  };
};

function transformToD3Tree(person: FamilyTreeNode): any {
  const node: FamilyTreeNode = {
    name: person.name,
    _id: person._id,
    gender: person.gender,
    attributes: person.attributes,
    children: [],
  };

  if (person.children?.length > 0) {
    node.children.push(...person.children.map(transformToD3Tree));
  }

  for (const spouse of person.spouses || []) {
    if (spouse.children?.length > 0) {
      node.children.push({
        name: `${spouse.name}`,
        attributes: {
          relation: "spouse",
          gender: spouse.gender,
        },
        _id: spouse._id,
        children: spouse.children.map(transformToD3Tree),
        gender: "male",
      });
    } else {
      node.children.push({
        name: `${spouse.name}`,
        attributes: {
          relation: "spouse",
          gender: spouse.gender,
        },
        _id: spouse._id,
        children: [],
        gender: spouse.gender,
      });
    }
  }

  for (const parent of person.parents || []) {
    node.children.push({
      name: `${parent.name}`,
      attributes: {
        relation: "parent",
        gender: parent.gender,
      },
      _id: parent._id,
      children: parent.children.map(transformToD3Tree),
      gender: parent.gender,
    });
  }

  return node;
}
