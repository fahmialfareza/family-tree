import { Suspense } from "react";
import { TreeCanvasClient } from "@/components/tree-canvas/tree-canvas-client";

export default async function TreePage({ params }: { params: Promise<{ treeId: string }> }) {
  const { treeId } = await params;
  return (
    <Suspense>
      <TreeCanvasClient treeId={treeId} />
    </Suspense>
  );
}
