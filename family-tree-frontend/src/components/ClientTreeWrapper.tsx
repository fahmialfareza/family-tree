"use client";

import dynamic from "next/dynamic";
import { FamilyTreeNode } from "./TreeWrapper";

// Dynamically import TreeWrapper with SSR disabled
const TreeWrapper = dynamic(() => import("./TreeWrapper"), {
  ssr: false,
  loading: () => <p>Loading tree...</p>,
});

export default function ClientTreeWrapper({ data }: { data: FamilyTreeNode }) {
  return <TreeWrapper data={data} />;
}
