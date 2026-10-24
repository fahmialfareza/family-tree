"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/api/client";
import { useMembers, useSetOwners } from "@/lib/api/hooks";
import type { Person } from "@/lib/api/types";

/**
 * Branch sharing (owners of branch-scoped trees): choose who may see this person in their lists and edit
 * them. Sharing also applies to their spouse and parents, which is how a whole branch gets shared.
 */
export function SharingPanel({ treeId, person }: { treeId: string; person: Person }) {
  const t = useTranslations("sharing");
  const tr = useTranslations("roles");
  const { data: members = [] } = useMembers(treeId);
  const setOwners = useSetOwners(treeId);
  const [owners, setOwnersState] = useState<string[]>(person.ownedBy ?? []);
  const toggle = (id: string, on: boolean) => setOwnersState((cur) => (on ? [...new Set([...cur, id])] : cur.filter((x) => x !== id)));
  const others = members.filter((m) => m.role !== "owner");

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("intro")}</p>
      {others.length === 0 ? (
        <p className="rounded-lg bg-secondary px-3 py-2 text-sm">{t("noMembers")}</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {others.map((m) => (
            <li key={m.userId} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{m.name}</span>
                <span className="block text-xs text-muted-foreground">{tr(m.role)}</span>
              </span>
              <Switch checked={owners.includes(m.userId)} onCheckedChange={(on) => toggle(m.userId, on)} aria-label={t("shareWith", { name: m.name })} />
            </li>
          ))}
        </ul>
      )}
      <Button
        onClick={async () => {
          try {
            const ownerIds = members.filter((m) => m.role === "owner").map((m) => m.userId);
            await setOwners.mutateAsync({ id: person._id, owners: [...new Set([...owners, ...ownerIds.filter((id) => (person.ownedBy ?? []).includes(id))])] });
            toast.success(t("saved"));
          } catch (err) {
            toast.error(errorMessage(err));
          }
        }}
        disabled={setOwners.isPending}
      >
        {setOwners.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {t("save")}
      </Button>
    </div>
  );
}
