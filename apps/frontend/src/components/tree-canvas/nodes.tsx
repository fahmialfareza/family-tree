"use client";

import { Handle, NodeToolbar, Position, type NodeProps } from "@xyflow/react";
import { Heart, Plus, UserRoundPlus, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { createContext, memo, useContext } from "react";
import { PersonAvatar } from "@/components/common/person-avatar";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { lifeSpan } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PersonFlowNode } from "./layout";

export type RelativeKind = "parent" | "spouse" | "child";

/** Lets nodes ask the canvas to open a person or start adding a relative, without prop drilling. */
export const CanvasActions = createContext<{
  open: (id: string) => void;
  addRelative: (anchorId: string, kind: RelativeKind) => void;
  canEditTree: boolean;
}>({ open: () => undefined, addRelative: () => undefined, canEditTree: false });

const accent = {
  male: "before:bg-node-male",
  female: "before:bg-node-female",
  other: "before:bg-node-other",
  unknown: "before:bg-border",
} as const;

export const PersonNode = memo(function PersonNode({ data, selected }: NodeProps<PersonFlowNode>) {
  const t = useTranslations("canvas");
  const { open, addRelative, canEditTree } = useContext(CanvasActions);
  const p = data.person;
  const deceased = p.status === "deceased";
  const span = lifeSpan(p.birthDate, p.deathDate);
  const canAdd = canEditTree && p.canEdit;

  return (
    <>
      <Handle type="target" position={Position.Top} className="!size-1 !min-h-0 !min-w-0 !border-0 !bg-transparent" isConnectable={false} />
      {canAdd ? (
        <NodeToolbar isVisible={selected} position={Position.Top} offset={8} className="no-print flex gap-1 rounded-full border bg-popover p-1 shadow-[var(--shadow-lift)]">
          {(
            [
              ["parent", Users, t("addParent")],
              ["spouse", Heart, t("addSpouse")],
              ["child", UserRoundPlus, t("addChild")],
            ] as const
          ).map(([kind, Icon, label]) => (
            <Tooltip key={kind}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => addRelative(p._id, kind)}
                  className="flex size-8 items-center justify-center rounded-full text-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={label}
                >
                  <Icon className="size-4" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          ))}
        </NodeToolbar>
      ) : null}
      <button
        type="button"
        onClick={() => open(p._id)}
        aria-label={t("openPerson", { name: p.name })}
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
          <span className="block truncate text-xs text-muted-foreground">
            {span || (p.nickname ? p.name : " ")}
          </span>
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
