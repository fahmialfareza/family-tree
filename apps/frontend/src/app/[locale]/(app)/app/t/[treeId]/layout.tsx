import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { Tree } from "@/lib/api/types";
import { BackendError, backendGet } from "@/lib/server/backend";

// cache(): generateMetadata and the layout both need the tree; one API call per request.
const loadTree = cache(async (treeId: string) => {
  try {
    return await backendGet<Tree>(`/api/trees/${encodeURIComponent(treeId)}`);
  } catch (err) {
    if (err instanceof BackendError && err.status === 404) notFound();
    throw err;
  }
});

export async function generateMetadata({ params }: { params: Promise<{ treeId: string }> }): Promise<Metadata> {
  const { treeId } = await params;
  const tree = await loadTree(treeId);
  return { title: tree.name };
}

// Non-members get the 404 page: the API answers 404 for trees you do not belong to.
export default async function TreeLayout({ children, params }: { children: React.ReactNode; params: Promise<{ treeId: string }> }) {
  const { treeId } = await params;
  await loadTree(treeId);
  return children;
}
