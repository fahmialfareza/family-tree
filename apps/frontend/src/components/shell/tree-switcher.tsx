"use client";

import { Check, ChevronsUpDown, Copy, Plus, TreePine } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { CopyDialog } from "@/components/copy/copy-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Tree } from "@/lib/api/types";

export function TreeSwitcher({
  trees,
  currentId,
}: {
  trees: Tree[];
  currentId?: string;
}) {
  const t = useTranslations("shell");
  const tr = useTranslations("roles");
  const router = useRouter();
  const [copying, setCopying] = useState(false);
  const current = trees.find((x) => x._id === currentId);
  const canCopyInto =
    !!current &&
    (current.role === "owner" || current.role === "editor") &&
    trees.some(
      (x) => x._id !== currentId && (x.role === "owner" || x.role === "editor"),
    );
  return (
    <>
      {current && canCopyInto ? (
        <CopyDialog
          treeId={current._id}
          open={copying}
          onOpenChange={setCopying}
          onCopied={(rootId) =>
            router.push(`/app/t/${current._id}?focus=${rootId}`)
          }
        />
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-xl border bg-card p-2.5 text-left shadow-[var(--shadow-soft)] outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
            <TreePine className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">
              {current?.name ?? t("chooseTree")}
            </span>
            {current?.role ? (
              <span className="block text-xs text-muted-foreground">
                {tr(current.role)}
              </span>
            ) : null}
          </span>
          <ChevronsUpDown
            className="size-4 text-muted-foreground"
            aria-hidden
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>{t("yourTrees")}</DropdownMenuLabel>
          {trees.map((tree) => (
            <DropdownMenuItem key={tree._id} asChild>
              <Link
                href={`/app/t/${tree._id}`}
                className="flex items-center gap-2"
              >
                <span className="flex-1 truncate">{tree.name}</span>
                {tree._id === currentId ? (
                  <Check className="size-4" aria-hidden />
                ) : null}
              </Link>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          {canCopyInto ? (
            <DropdownMenuItem onSelect={() => setCopying(true)}>
              <Copy className="size-4" aria-hidden /> {t("copyIntoTree")}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem asChild>
            <Link href="/app/onboarding?new=1">
              <Plus className="size-4" aria-hidden /> {t("newTree")}
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
