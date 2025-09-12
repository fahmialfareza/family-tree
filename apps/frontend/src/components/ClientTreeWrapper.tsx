"use client";

import dynamic from "next/dynamic";
import { FamilyTreeNode } from "./TreeWrapper";

// Dynamically import TreeWrapper with SSR disabled
const TreeWrapper = dynamic(() => import("./TreeWrapper"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center p-8">
      <div className="relative h-96 w-full max-w-4xl rounded-md overflow-hidden bg-gray-200 dark:bg-gray-700">
        {/* Skeleton header */}
        <div className="absolute top-6 left-1/2 -translate-x-1/2 w-1/3 h-6 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
        {/* Skeleton vertical lines */}
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-1 h-40 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
        {/* Skeleton rectangles for nodes */}
        <div className="absolute top-16 left-1/4 w-1/6 h-10 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
        <div className="absolute top-16 right-1/4 w-1/6 h-10 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
        {/* Skeleton horizontal connector */}
        <div className="absolute top-28 left-1/4 w-1/2 h-2 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
        {/* Skeleton child nodes */}
        <div className="absolute top-32 left-[20%] w-1/6 h-8 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
        <div className="absolute top-32 left-[40%] w-1/6 h-8 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
        <div className="absolute top-32 left-[60%] w-1/6 h-8 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
      </div>
    </div>
  ),
});

export default function ClientTreeWrapper({ data }: { data: FamilyTreeNode }) {
  return <TreeWrapper data={data} />;
}
