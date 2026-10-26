"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  getNodesBounds,
  getViewportForBounds,
  useReactFlow,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toPng } from "html-to-image";
import {
  Copy,
  Download,
  Loader2,
  Maximize,
  TreePine,
  UserRoundPlus,
} from "lucide-react";
import {
  type CopyFromPerson,
  CopyDialog,
  useCopySources,
} from "@/components/copy/copy-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/common/page";
import { PersonDrawer } from "@/components/person/person-drawer";
import { PersonForm } from "@/components/person/person-form";
import {
  QuickAddDialog,
  type QuickAddRequest,
} from "@/components/person/quick-add-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { errorMessage } from "@/lib/api/client";
import { ExportDialog } from "@/components/export/export-dialog";
import { useDeletePerson, useGraph } from "@/lib/api/hooks";
import { isBranchScope, selectBranch } from "@/lib/branch";
import { saveFile } from "@/lib/native";
import { useMediaQuery } from "@/lib/use-media-query";
import {
  type FlowNode,
  layoutGraph,
  neighbourhood,
  PERSON_HEIGHT,
  PERSON_WIDTH,
} from "./layout";
import { CanvasActions, nodeTypes, type RelativeKind } from "./nodes";

const DEPTHS = ["2", "4", "6", "all"] as const;
// Above this size the canvas starts with a neighbourhood around the focus person instead of everyone.
const FULL_TREE_LIMIT = 250;
// Below this zoom person cards are too small to read, so the initial view doesn't fit everything.
const MIN_READABLE_ZOOM = 0.5;

/** Prints one image on its own, via a hidden frame: no sidebar or toolbar, scaled to the paper. */
function printImage(url: string, title: string, landscape: boolean) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc || !frame.contentWindow) return frame.remove();
  doc.title = title;
  const style = doc.createElement("style");
  style.textContent = `@page { size: ${landscape ? "landscape" : "portrait"}; margin: 10mm; } html, body { margin: 0; height: 100%; } body { display: flex; align-items: center; justify-content: center; } img { max-width: 100%; max-height: 100%; object-fit: contain; }`;
  doc.head.appendChild(style);
  const img = doc.createElement("img");
  img.alt = title;
  img.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    // Most browsers block until the dialog closes; remove the frame afterwards either way.
    setTimeout(() => frame.remove(), 1000);
  };
  img.src = url;
  doc.body.appendChild(img);
}

function Canvas({ treeId }: { treeId: string }) {
  const t = useTranslations("canvas");
  const te = useTranslations("export");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const wide = useMediaQuery("(min-width: 1024px)", true);
  const { data: graph, isLoading, error, dataUpdatedAt } = useGraph(treeId);
  const { fitView, setCenter, getNodes } = useReactFlow();

  const focusId = params.get("focus") ?? undefined;
  // ?branch=descendants|ancestors|both|nearby&from=<id>[&steps=n]: show only that branch (export dialog).
  const branchParam = params.get("branch");
  const branchFrom = params.get("from");
  const branchSteps = Number(params.get("steps") ?? "2") || 2;
  const branch = useMemo(
    () =>
      isBranchScope(branchParam) && branchFrom && graph?.people.some((p) => p._id === branchFrom)
        ? { scope: branchParam, from: branchFrom, steps: branchSteps }
        : null,
    [branchParam, branchFrom, branchSteps, graph],
  );
  const branchName = branch ? graph?.people.find((p) => p._id === branch.from)?.name : undefined;
  // ?export=png: draw the picture once the tree is laid out, then drop the flag.
  const exportParam = params.get("export");
  const exportRequested = exportParam === "png" || exportParam === "print" ? exportParam : null;
  const [exportOpen, setExportOpen] = useState(false);
  const autoExported = useRef(false);
  const openId = params.get("person");
  const tab = params.get("tab") ?? "overview";
  const [depth, setDepth] = useState<(typeof DEPTHS)[number] | null>(null);
  const [layout, setLayout] = useState<{
    key: string;
    nodes: FlowNode[];
    edges: Edge[];
  }>({ key: "", nodes: [], edges: [] });
  const [quickAdd, setQuickAdd] = useState<QuickAddRequest>(null);
  const [firstPerson, setFirstPerson] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [copyOut, setCopyOut] = useState<CopyFromPerson | null>(null);
  const copySources = useCopySources(treeId);
  const deletePerson = useDeletePerson(treeId);
  const deleting = graph?.people.find((p) => p._id === deleteId);

  const role = graph?.tree.role ?? "viewer";
  const effectiveDepth = exportRequested && !branch ? "all" : (depth ?? (graph && graph.people.length > FULL_TREE_LIMIT ? "4" : "all"));
  const branchKey = branch ? `${branch.scope}:${branch.from}:${branch.steps}` : "";
  const layoutKey = `${dataUpdatedAt}|${focusId ?? ""}|${effectiveDepth}|${branchKey}`;
  const { nodes, edges } = layout;
  const layingOut = !!graph && layout.key !== layoutKey;

  const setQuery = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) next.delete(k);
        else next.set(k, v);
      }
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  useEffect(() => {
    if (!graph) return;
    let cancelled = false;
    const visible = branch
      ? selectBranch(graph, branch.from, branch.scope, branch.steps)
      : neighbourhood(
          graph,
          focusId,
          effectiveDepth === "all" ? Infinity : Number(effectiveDepth),
        );
    layoutGraph(graph, visible, { focusId }).then((res) => {
      if (!cancelled) setLayout({ key: layoutKey, ...res });
    });
    return () => {
      cancelled = true;
    };
  }, [graph, focusId, effectiveDepth, layoutKey, branch]);

  // Center on the focus person after each layout, otherwise fit everything.
  useEffect(() => {
    if (!nodes.length) return;
    const id = requestAnimationFrame(() => {
      const target = focusId ? nodes.find((n) => n.id === focusId) : undefined;
      if (target)
        setCenter(
          target.position.x + PERSON_WIDTH / 2,
          target.position.y + PERSON_HEIGHT / 2,
          { zoom: 1, duration: 400 },
        );
      else {
        // On small screens fitting a big tree makes the cards unreadable; start at the top
        // generation at a readable zoom instead and let the user pan from there.
        const pane = document.querySelector<HTMLElement>(".react-flow");
        const people = nodes.filter((n) => n.type === "person");
        const bounds = getNodesBounds(people);
        const fitZoom = pane
          ? Math.min(
              pane.clientWidth / (bounds.width * 1.15),
              pane.clientHeight / (bounds.height * 1.15),
            )
          : 1;
        if (fitZoom >= MIN_READABLE_ZOOM || !pane) {
          fitView({ padding: 0.15, duration: 300, maxZoom: 1.1 });
          return;
        }
        const topY = Math.min(...people.map((n) => n.position.y));
        const midX = bounds.x + bounds.width / 2;
        const start = people
          .filter((n) => n.position.y === topY)
          .reduce((a, b) =>
            Math.abs(b.position.x - midX) < Math.abs(a.position.x - midX)
              ? b
              : a,
          );
        const zoom = 0.8;
        setCenter(
          start.position.x + PERSON_WIDTH / 2,
          // Put the top generation near the top edge rather than the middle.
          start.position.y + pane.clientHeight / (2 * zoom) - 90 / zoom,
          { zoom, duration: 300 },
        );
      }
    });
    return () => cancelAnimationFrame(id);
  }, [nodes, focusId, fitView, setCenter]);

  const actions = useMemo(
    () => ({
      open: (id: string) => setQuery({ person: id, tab: null }),
      edit: (id: string) => setQuery({ person: id, tab: "edit" }),
      remove: (id: string) => setDeleteId(id),
      copyOut: (id: string) => {
        const p = graph?.people.find((x) => x._id === id);
        if (p) setCopyOut({ treeId, personId: id, name: p.name });
      },
      canCopyOut: copySources.length > 0,
      addRelative: (anchorId: string, kind: RelativeKind) =>
        setQuickAdd({ anchorId, kind }),
      canEditTree: role !== "viewer",
    }),
    [setQuery, role, graph, treeId, copySources.length, setDeleteId, setCopyOut, setQuickAdd],
  );

  /** Draws the laid-out tree and saves it as a PNG, or prints it (light theme, fitted to the page). */
  const exportTree = useCallback(async (mode: "png" | "print") => {
    const el = document.querySelector<HTMLElement>(".react-flow__viewport");
    const all = getNodes();
    if (!el || !all.length) return;
    setExporting(true);
    // Paper: draw in the light theme whatever the screen uses, so printing does not spend a page of ink.
    const root = document.documentElement;
    const wasDark = mode === "print" && root.classList.contains("dark");
    if (wasDark) root.classList.remove("dark");
    const bg = getComputedStyle(document.body).backgroundColor;
    // html-to-image cannot draw the lines' translucent oklch() stroke, so the picture had cards but no
    // lines. While drawing, give each line the same color blended onto the background as plain rgb().
    const restyled: [SVGElement, string | null][] = [];
    const swatch = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    const solid = (color: string) => {
      if (!swatch) return color;
      swatch.fillStyle = bg;
      swatch.fillRect(0, 0, 1, 1);
      swatch.fillStyle = color;
      swatch.fillRect(0, 0, 1, 1);
      const [r, g, b] = swatch.getImageData(0, 0, 1, 1).data;
      return `rgb(${r}, ${g}, ${b})`;
    };
    try {
      el.querySelectorAll<SVGElement>(".react-flow__edge-path").forEach((path) => {
        restyled.push([path, path.getAttribute("style")]);
        path.style.stroke = solid(getComputedStyle(path).stroke);
      });
      const bounds = getNodesBounds(all);
      const width = Math.min(Math.ceil(bounds.width + 160), 8000);
      const height = Math.min(Math.ceil(bounds.height + 160), 8000);
      const vp = getViewportForBounds(bounds, width, height, 0.1, 2, 0.05);
      const url = await toPng(el, {
        backgroundColor: bg,
        width,
        height,
        pixelRatio: 2,
        style: {
          width: `${width}px`,
          height: `${height}px`,
          transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`,
        },
        filter: (node) =>
          !(
            node instanceof HTMLElement &&
            node.classList.contains("react-flow__node-toolbar")
          ),
      });
      const base = `${graph?.tree.name ?? "sakdulur"}${branchName ? ` - ${branchName}` : ""}`.replace(/[\\/:*?"<>|]+/g, "").trim();
      if (mode === "print") printImage(url, base, width >= height);
      else await saveFile(`${base}.png`, url);
    } catch {
      toast.error(t("exportFailed"));
    } finally {
      for (const [path, style] of restyled) {
        if (style === null) path.removeAttribute("style");
        else path.setAttribute("style", style);
      }
      if (wasDark) root.classList.add("dark");
      setExporting(false);
    }
  }, [getNodes, graph, t, branchName]);

  // Export dialog asked for a picture: wait until this layout is drawn, then save it once.
  useEffect(() => {
    if (!exportRequested) {
      autoExported.current = false;
      return;
    }
    if (layingOut || !nodes.length || autoExported.current) return;
    autoExported.current = true;
    const id = window.setTimeout(async () => {
      await exportTree(exportRequested);
      setQuery({ export: null });
    }, 700);
    return () => window.clearTimeout(id);
  }, [exportRequested, layingOut, nodes, exportTree, setQuery]);

  if (error) {
    return (
      <EmptyState
        icon={TreePine}
        title={t("loadFailed")}
        description={String((error as Error).message)}
        className="m-6"
      />
    );
  }
  if (isLoading || !graph) {
    return (
      <div className="flex flex-1 items-center justify-center" role="status">
        <Loader2
          className="size-6 animate-spin text-muted-foreground"
          aria-hidden
        />
        <span className="sr-only">{t("loading")}</span>
      </div>
    );
  }

  return (
    <CanvasActions.Provider value={actions}>
      <div className="relative flex min-h-[calc(100dvh-7.5rem)] flex-1 md:min-h-dvh">
        {branch && branchName ? (
          <div className="absolute inset-x-0 bottom-3 z-10 flex justify-center px-3 md:bottom-6">
            <div className="flex max-w-full items-center gap-3 rounded-full border bg-card/95 py-1.5 pl-4 pr-1.5 text-sm shadow-[var(--shadow-soft)] backdrop-blur">
              <span className="min-w-0 truncate">{te(`branchBanner.${branch.scope}`, { name: branchName })}</span>
              <Button size="sm" variant="secondary" className="shrink-0 rounded-full" onClick={() => setQuery({ branch: null, from: null, steps: null })}>
                {te("showEveryone")}
              </Button>
            </div>
          </div>
        ) : null}
        {exporting ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/60 backdrop-blur-sm" role="status">
            <span className="flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm shadow-[var(--shadow-soft)]">
              <Loader2 className="size-4 animate-spin" aria-hidden /> {te("makingImage")}
            </span>
          </div>
        ) : null}
        {graph.people.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <EmptyState
              icon={TreePine}
              title={t("emptyTitle")}
              description={
                role === "viewer" ? t("emptyViewer") : t("emptyBody")
              }
              action={
                role !== "viewer" ? (
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button onClick={() => setFirstPerson(true)}>
                      <UserRoundPlus className="size-4" aria-hidden />{" "}
                      {t("addFirst")}
                    </Button>
                    {copySources.length ? (
                      <Button
                        variant="outline"
                        onClick={() => setCopying(true)}
                      >
                        <Copy className="size-4" aria-hidden />{" "}
                        {t("copyFromTree")}
                      </Button>
                    ) : null}
                  </div>
                ) : undefined
              }
            />
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            edgesFocusable={false}
            elementsSelectable
            minZoom={0.1}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
            onNodeClick={(_, node) => node.type === "person" && undefined}
            aria-label={t("canvasLabel", { name: graph.tree.name })}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} />
            <Controls
              showInteractive={false}
              position="bottom-right"
              className="no-print"
            />
            {wide ? (
              <MiniMap
                pannable
                zoomable
                className="no-print !rounded-lg !border"
                nodeStrokeWidth={2}
              />
            ) : null}
          </ReactFlow>
        )}

        {graph.people.length > 0 ? (
          <div className="no-print absolute left-3 right-3 top-3 flex w-fit max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-1.5 rounded-xl border bg-card/95 p-1.5 shadow-[var(--shadow-soft)] backdrop-blur sm:gap-2">
            <span className="hidden max-w-48 truncate px-2 font-display text-sm font-semibold lg:inline">

              {graph.tree.name}
            </span>
            <Select
              value={effectiveDepth}
              onValueChange={(v) => setDepth(v as (typeof DEPTHS)[number])}
            >
              <SelectTrigger className="h-8 w-auto" aria-label={t("depth")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEPTHS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d === "all"
                      ? t("depthAll")
                      : t("depthN", { n: Number(d) })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {role !== "viewer" ? (
              <Button
                size="sm"
                className="h-8"
                onClick={() => setFirstPerson(true)}
                aria-label={t("addPerson")}
              >
                <UserRoundPlus className="size-4" aria-hidden />{" "}
                <span className="hidden lg:inline">{t("addPerson")}</span>
              </Button>
            ) : null}
            {role !== "viewer" && copySources.length ? (
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => setCopying(true)}
                aria-label={t("copyFromTree")}
              >
                <Copy className="size-4" aria-hidden />{" "}
                <span className="hidden lg:inline">
                  {t("copyFromTreeShort")}
                </span>
              </Button>
            ) : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => fitView({ padding: 0.15, duration: 300 })}
                  aria-label={t("fit")}
                >
                  <Maximize className="size-4" aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("fit")}</TooltipContent>
            </Tooltip>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setExportOpen(true)}
              disabled={exporting}
              aria-label={t("exportPng")}
            >
              {exporting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}{" "}
              <span className="hidden lg:inline">{t("exportPng")}</span>
            </Button>
            {layingOut ? (
              <Loader2
                className="mx-1 size-4 animate-spin text-muted-foreground"
                aria-label={t("loading")}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      <PersonDrawer
        treeId={treeId}
        personId={openId}
        graph={graph}
        role={role}
        tab={tab}
        onTabChange={(next) => setQuery({ tab: next })}
        onClose={() => setQuery({ person: null, tab: null })}
        onFocus={(id) => setQuery({ focus: id, person: null, tab: null })}
        onAddRelative={(anchorId, kind) => setQuickAdd({ anchorId, kind })}
        onCopyOut={
          copySources.length
            ? (id, name) => setCopyOut({ treeId, personId: id, name })
            : undefined
        }
      />
      <QuickAddDialog
        treeId={treeId}
        graph={graph}
        request={quickAdd}
        onClose={() => setQuickAdd(null)}
        onCreated={(id) => {
          setQuickAdd(null);
          setQuery({ focus: id, person: null });
        }}
      />
      <Dialog open={firstPerson} onOpenChange={setFirstPerson}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {graph.people.length ? t("addPerson") : t("addFirst")}
            </DialogTitle>
            <DialogDescription>
              {graph.people.length ? t("addPersonHint") : t("addFirstHint")}
            </DialogDescription>
          </DialogHeader>
          <PersonForm
            treeId={treeId}
            onSaved={(p) => {
              setFirstPerson(false);
              setQuery({
                focus: p._id,
                person: graph.people.length ? p._id : null,
                tab: graph.people.length ? "relatives" : null,
              });
            }}
            onCancel={() => setFirstPerson(false)}
          />
        </DialogContent>
      </Dialog>
      <CopyDialog
        treeId={treeId}
        open={copying}
        onOpenChange={setCopying}
        onCopied={(rootId) =>
          setQuery({ focus: rootId, person: null, tab: null })
        }
      />
      <ExportDialog
        key={exportOpen ? "open" : "closed"}
        treeId={treeId}
        open={exportOpen}
        onOpenChange={setExportOpen}
        canExportFiles={role === "owner"}
        startPersonId={openId ?? focusId ?? undefined}
      />
      <CopyDialog
        key={copyOut?.personId ?? "none"}
        fromPerson={copyOut ?? undefined}
        open={!!copyOut}
        onOpenChange={(open) => !open && setCopyOut(null)}
      />
      <AlertDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("deleteTitle", { name: deleting?.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t("deleteBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              disabled={deletePerson.isPending}
              onClick={async (e) => {
                e.preventDefault();
                if (!deleteId) return;
                try {
                  await deletePerson.mutateAsync(deleteId);
                  toast.success(t("deleted", { name: deleting?.name ?? "" }));
                  setDeleteId(null);
                  setQuery({
                    person: openId === deleteId ? null : openId,
                    focus: focusId === deleteId ? null : (focusId ?? null),
                  });
                } catch (err) {
                  toast.error(errorMessage(err));
                }
              }}
            >
              {t("deletePerson")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CanvasActions.Provider>
  );
}

export function TreeCanvas({ treeId }: { treeId: string }) {
  return (
    <ReactFlowProvider>
      <Canvas treeId={treeId} />
    </ReactFlowProvider>
  );
}
