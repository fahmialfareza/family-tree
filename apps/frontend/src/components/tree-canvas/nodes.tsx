"use client";

import { Handle, NodeToolbar, Position, type NodeProps } from "@xyflow/react";
import { Copy, Eye, Heart, type LucideIcon, Pencil, Plus, Trash2, UserRoundPlus, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { createContext, Fragment, memo, useContext, useEffect, useRef, useState } from "react";
import { PersonAvatar } from "@/components/common/person-avatar";
import { Badge } from "@/components/ui/badge";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { lifeSpan } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PersonFlowNode } from "./layout";

export type RelativeKind = "parent" | "spouse" | "child";

/** Lets nodes ask the canvas to open, edit, remove or extend a person, without prop drilling. */
export const CanvasActions = createContext<{
  open: (id: string) => void;
  edit: (id: string) => void;
  remove: (id: string) => void;
  addRelative: (anchorId: string, kind: RelativeKind) => void;
  copyOut: (id: string) => void;
  canEditTree: boolean;
  canCopyOut: boolean;
}>({
  open: () => undefined,
  edit: () => undefined,
  remove: () => undefined,
  addRelative: () => undefined,
  copyOut: () => undefined,
  canEditTree: false,
  canCopyOut: false,
});

const accent = {
  male: "before:bg-node-male",
  female: "before:bg-node-female",
  other: "before:bg-node-other",
  unknown: "before:bg-border",
} as const;

type Action = { key: string; label: string; icon: LucideIcon; run: () => void; danger?: boolean };

/** Edit / add relatives / delete for one person; shared by the hover toolbar and the right-click menu. */
function usePersonActions(id: string, canEdit: boolean): Action[] {
  const t = useTranslations("canvas");
  const { edit, remove, addRelative, canEditTree } = useContext(CanvasActions);
  if (!canEditTree || !canEdit) return [];
  return [
    { key: "edit", label: t("editPerson"), icon: Pencil, run: () => edit(id) },
    { key: "parent", label: t("addParent"), icon: Users, run: () => addRelative(id, "parent") },
    { key: "spouse", label: t("addSpouse"), icon: Heart, run: () => addRelative(id, "spouse") },
    { key: "child", label: t("addChild"), icon: UserRoundPlus, run: () => addRelative(id, "child") },
    { key: "delete", label: t("deletePerson"), icon: Trash2, run: () => remove(id), danger: true },
  ];
}

export const PersonNode = memo(function PersonNode({ data, selected }: NodeProps<PersonFlowNode>) {
  const t = useTranslations("canvas");
  const { open, copyOut, canCopyOut } = useContext(CanvasActions);
  const p = data.person;
  const deceased = p.status === "deceased";
  const span = lifeSpan(p.birthDate, p.deathDate);
  const actions = usePersonActions(p._id, p.canEdit);

  // The toolbar shows while the card or the toolbar itself is hovered or focused; a short delay lets the
  // pointer travel from the card to the toolbar without it disappearing.
  const [active, setActive] = useState(false);
  const hideTimer = useRef<number | undefined>(undefined);
  const show = () => {
    window.clearTimeout(hideTimer.current);
    setActive(true);
  };
  const hide = () => {
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setActive(false), 180);
  };
  useEffect(() => () => window.clearTimeout(hideTimer.current), []);
  const hoverProps = { onMouseEnter: show, onMouseLeave: hide, onFocus: show, onBlur: hide };

  return (
    <>
      <Handle type="target" position={Position.Top} className="!size-1 !min-h-0 !min-w-0 !border-0 !bg-transparent" isConnectable={false} />
      {actions.length ? (
        <NodeToolbar
          isVisible={active || selected}
          position={Position.Top}
          offset={6}
          className="no-print flex gap-0.5 rounded-full border bg-popover p-1 shadow-[var(--shadow-lift)]"
          aria-label={t("personActions", { name: p.name })}
          {...hoverProps}
        >
          {actions.map((a) => (
            <Tooltip key={a.key}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={a.run}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
                    a.danger ? "text-destructive" : "text-foreground",
                  )}
                  aria-label={a.label}
                >
                  <a.icon className="size-4" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent>{a.label}</TooltipContent>
            </Tooltip>
          ))}
        </NodeToolbar>
      ) : null}
      <ContextMenu>
        <ContextMenuTrigger asChild disabled={!actions.length}>
          <button
            type="button"
            onClick={() => open(p._id)}
            aria-label={t("openPerson", { name: p.name })}
            {...hoverProps}
            className={cn(
              "relative flex h-[72px] w-[208px] items-center gap-3 overflow-hidden rounded-xl border bg-card pl-4 pr-3 text-left shadow-[var(--shadow-soft)] transition-shadow",
              "before:absolute before:inset-y-0 before:left-0 before:w-1",
              accent[p.gender] ?? accent.unknown,
              "hover:shadow-[var(--shadow-lift)] focus-visible:ring-2 focus-visible:ring-ring",
              (selected || data.focused) && "ring-2 ring-primary",
              deceased && "bg-muted/60",
            )}
          >
            <PersonAvatar name={p.name} photoUrl={p.photoUrl} gender={p.gender} deceased={deceased} className="size-10 ring-0 ring-offset-0" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold" title={p.name}>
                {p.nickname || p.name}
              </span>
              <span className="block truncate text-xs text-muted-foreground">{span || (p.nickname ? p.name : "\u00a0")}</span>
            </span>
            {data.isSelf ? (
              <Badge variant="secondary" className="absolute right-1.5 top-1.5 h-5 px-1.5 text-[10px]">
                {t("you")}
              </Badge>
            ) : null}
            {deceased ? (
              <span className="absolute bottom-1.5 right-2 text-xs text-muted-foreground" aria-label={t("deceased")}>
                †
              </span>
            ) : null}
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-52">
          <ContextMenuItem onSelect={() => open(p._id)}>
            <Eye className="size-4" aria-hidden /> {t("viewPerson")}
          </ContextMenuItem>
          <ContextMenuSeparator />
          {actions.length && canCopyOut ? (
            <ContextMenuItem onSelect={() => copyOut(p._id)}>
              <Copy className="size-4" aria-hidden /> {t("copyToTree")}
            </ContextMenuItem>
          ) : null}
          {actions.map((a) => (
            <Fragment key={a.key}>
              {a.danger ? <ContextMenuSeparator /> : null}
              <ContextMenuItem onSelect={a.run} variant={a.danger ? "destructive" : "default"}>
                <a.icon className="size-4" aria-hidden /> {a.label}
              </ContextMenuItem>
            </Fragment>
          ))}
        </ContextMenuContent>
      </ContextMenu>
      <Handle type="source" position={Position.Bottom} className="!size-1 !min-h-0 !min-w-0 !border-0 !bg-transparent" isConnectable={false} />
    </>
  );
});

export const UnionNode = memo(function UnionNode() {
  return (
    <>
      <Handle type="target" position={Position.Top} className="!size-1 !min-h-0 !min-w-0 !border-0 !bg-transparent" isConnectable={false} />
      <div className="flex size-[10px] items-center justify-center rounded-full bg-terracotta" aria-hidden />
      <Handle type="source" position={Position.Bottom} className="!size-1 !min-h-0 !min-w-0 !border-0 !bg-transparent" isConnectable={false} />
    </>
  );
});

export const nodeTypes = { person: PersonNode, union: UnionNode };

export function AddFirstPersonHint() {
  const t = useTranslations("canvas");
  return (
    <span className="inline-flex items-center gap-1">
      <Plus className="size-4" aria-hidden /> {t("addFirst")}
    </span>
  );
}
