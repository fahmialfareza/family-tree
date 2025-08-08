"use client";

import Tree from "react-d3-tree";

export interface FamilyTreeNode {
  _id: string;
  name: string;
  children: FamilyTreeNode[];
}

const FamilyTree: React.FC<{ data: FamilyTreeNode }> = ({ data }) => {
  return (
    <div style={{ width: "100%", height: "100vh" }}>
      <Tree data={data} orientation="vertical" />
    </div>
  );
};

export default FamilyTree;
