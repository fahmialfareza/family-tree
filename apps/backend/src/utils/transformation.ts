import { TD3Node } from "@/models/types/familyTree";

export function transformToCoupleTree(node: any): TD3Node[] {
  // Helper to check if a child is a spouse node
  const isSpouse = (child: any) =>
    child.attributes && child.attributes.relation === "spouse";

  // Helper to check if a child is a parent node
  const isParent = (child: any) =>
    child.attributes && child.attributes.relation === "parent";

  // If node has no children or no spouse children, return as is
  if (!node.children || node.children.length === 0) {
    return [
      {
        name: node.name,
        _id: node._id,
        gender: node.gender,
        attributes: node.attributes || {},
        children: [],
      },
    ];
  }

  // Find all spouse children
  const spouseChildren = node.children.filter(isSpouse);

  // If no spouse children, just transform children recursively
  if (spouseChildren.length === 0) {
    return [
      {
        name: node.name,
        _id: node._id,
        gender: node.gender,
        attributes: node.attributes || {},
        children: node.children
          .filter((c: any) => !isParent(c))
          .flatMap((c: any) => transformToCoupleTree(c)),
      },
    ];
  }

  // For each spouse, create a couple node
  const result: TD3Node[] = [];
  for (const spouse of spouseChildren) {
    // Couple name
    const coupleName = `${node.name} & ${spouse.name}`;
    // Couple children: transform spouse's children recursively
    const coupleChildren = (spouse.children || [])
      .filter((c: any) => !isSpouse(c) && !isParent(c))
      .flatMap((c: any) => transformToCoupleTree(c));

    result.push({
      name: coupleName,
      _id: node._id,
      gender: undefined,
      attributes: { ...node?.attributes, gender: undefined },
      children: coupleChildren,
    });
  }

  // If there are children not under any spouse (single parent children)
  const nonSpouseChildren = node.children.filter(
    (c: any) => !isSpouse(c) && !isParent(c)
  );
  if (nonSpouseChildren.length > 0) {
    // Attach them to the main person as a separate node
    result.push({
      name: node.name,
      _id: node._id,
      gender: node.gender,
      attributes: node.attributes || {},
      children: nonSpouseChildren.flatMap((c: any) => transformToCoupleTree(c)),
    });
  }

  return result;
}
