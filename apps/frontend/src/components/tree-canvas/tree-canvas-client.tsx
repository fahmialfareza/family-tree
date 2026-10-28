"use client";

import { Loader2 } from "lucide-react";
import { useSyncExternalStore } from "react";
import { TreeCanvas } from "./tree-canvas";

const noSubscribe = () => () => {};

// The canvas measures the viewport and runs the ELK layout in the browser, so it is drawn only there (a spinner
// on the server and during hydration, which also avoids mismatches when the tree data is already cached). A
// static import, not next/dynamic: its code is then named in the page's HTML, so the offline copy (public/sw.js)
// keeps it with the page; loaded on demand, it could be missing offline.
export function TreeCanvasClient({ treeId }: { treeId: string }) {
  const inBrowser = useSyncExternalStore(noSubscribe, () => true, () => false);
  if (!inBrowser) {
    return (
      <div className="flex flex-1 items-center justify-center" role="status" aria-busy="true">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }
  return <TreeCanvas treeId={treeId} />;
}
