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
  Printer,
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
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useDeletePerson, useGraph } from "@/lib/api/hooks";
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

function Canvas({ treeId }: { treeId: string }) {
  const t = useTranslations("canvas");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const wide = useMediaQuery("(min-width: 1024px)", true);
  const { data: graph, isLoading, error, dataUpdatedAt } = useGraph(treeId);
  const { fitView, setCenter, getNodes } = useReactFlow();

  const focusId = params.get("focus") ?? undefined;
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
  const effectiveDepth =
    depth ?? (graph && graph.people.length > FULL_TREE_LIMIT ? "4" : "all");
  const layoutKey = `${dataUpdatedAt}|${focusId ?? ""}|${effectiveDepth}`;
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
    const visible = neighbourhood(
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
  }, [graph, focusId, effectiveDepth, layoutKey]);

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
    [setQuery, role, graph, treeId, copySources.length],
  );

  async function exportPng() {
    const el = document.querySelector<HTMLElement>(".react-flow__viewport");
    const all = getNodes();
    if (!el || !all.length) return;
    setExporting(true);
    try {
      const bounds = getNodesBounds(all);
      const width = Math.min(Math.ceil(bounds.width + 160), 8000);
      const height = Math.min(Math.ceil(bounds.height + 160), 8000);
      const vp = getViewportForBounds(bounds, width, height, 0.1, 2, 0.05);
      const bg = getComputedStyle(document.body).backgroundColor;
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
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(graph?.tree.name ?? "family-tree").replace(/[^\w-]+/g, "-")}.png`;
      a.click();
    } catch {
      toast.error(t("exportFailed"));
    } finally {
      setExporting(false);
    }
  }

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
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={exportPng}
                  disabled={exporting}
                  aria-label={t("exportPng")}
                >
                  {exporting ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Download className="size-4" aria-hidden />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("exportPng")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden size-8 md:inline-flex"
                  onClick={() => window.print()}
                  aria-label={t("print")}
                >
                  <Printer className="size-4" aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("print")}</TooltipContent>
            </Tooltip>
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
