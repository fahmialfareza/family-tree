"use client";

import { Loader2 } from "lucide-react";
import dynamic from "next/dynamic";

// The canvas measures the viewport and runs the ELK layout in the browser, so it is never server-rendered.
// Rendering it only on the client also avoids hydration mismatches when the tree data is already cached.
export const TreeCanvasClient = dynamic(() => import("./tree-canvas").then((m) => m.TreeCanvas), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 items-center justify-center" role="status" aria-busy="true">
      <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
    </div>
  ),
});
