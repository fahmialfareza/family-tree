import { Suspense } from "react";
import { TreeCanvas } from "@/components/tree-canvas/tree-canvas";

export default async function TreePage({ params }: { params: Promise<{ treeId: string }> }) {
  const { treeId } = await params;
  return (
    <Suspense>
      <TreeCanvas treeId={treeId} />
    </Suspense>
  );
}
