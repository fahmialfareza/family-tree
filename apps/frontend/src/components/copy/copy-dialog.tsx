"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  Loader2,
  Orbit,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PersonAvatar } from "@/components/common/person-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/api/client";
import {
  useGraph,
  useImportBranch,
  useImportPreview,
  useMe,
} from "@/lib/api/hooks";
import type { ImportRequest, ImportScope } from "@/lib/api/types";
import { lifeSpan } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Other trees where the user is owner or editor: valid sources to copy into `treeId`, or destinations to copy to. */
export function useCopySources(treeId: string) {
  const { data: me } = useMe();
  return (me?.trees ?? []).filter(
    (t) => t._id !== treeId && (t.role === "owner" || t.role === "editor"),
  );
}

export type CopyFromPerson = { treeId: string; personId: string; name: string };

const SCOPES: { value: ImportScope; icon: typeof ArrowDown }[] = [
  { value: "descendants", icon: ArrowDown },
  { value: "ancestors", icon: ArrowUp },
  { value: "both", icon: ArrowUpDown },
  { value: "nearby", icon: Orbit },
];

/**
 * Copy a branch between trees, in either direction:
 * - into `treeId`: pick another tree, the person to start from and how far to go;
 * - from `fromPerson`: their branch goes to another tree the user picks.
 * The preview shows who is new; only names, dates and places travel, and copies stay linked to their
 * originals so they can be updated later.
 */
export function CopyDialog({
  treeId,
  fromPerson,
  open,
  onOpenChange,
  onCopied,
}: {
  treeId?: string;
  fromPerson?: CopyFromPerson;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCopied?: (rootId: string, destTreeId: string) => void;
}) {
  const t = useTranslations("copy");
  const tc = useTranslations("common");
  const router = useRouter();
  const outward = !!fromPerson;
  const others = useCopySources(outward ? fromPerson.treeId : (treeId ?? ""));
  const sources = outward ? [] : others;
  const [destChoice, setDestChoice] = useState("");
  const dest = outward ? destChoice || others[0]?._id || "" : (treeId ?? "");
  const [sourceId, setSourceId] = useState("");
  const [pickedId, setPersonId] = useState("");
  const personId = outward ? fromPerson.personId : pickedId;
  const [scope, setScope] = useState<ImportScope>("descendants");
  const [steps, setSteps] = useState("2");
  const [updateExisting, setUpdateExisting] = useState(true);
  const source = outward
    ? fromPerson.treeId
    : sourceId || sources[0]?._id || "";
  const { data: graph, isLoading: loadingGraph } = useGraph(
    outward ? "" : source,
  );
  const candidates = useMemo(
    () =>
      (graph?.people ?? [])
        .filter((p) => p.canEdit)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [graph],
  );
  const request: ImportRequest | null =
    source && personId && dest
      ? {
          sourceTreeId: source,
          personId,
          scope,
          steps: scope === "nearby" ? Number(steps) : undefined,
          updateExisting,
        }
      : null;
  const preview = useImportPreview(dest, request);
  const copy = useImportBranch(dest);
  const pickedName = outward
    ? fromPerson.name
    : candidates.find((p) => p._id === personId)?.name;
  const destName = others.find((x) => x._id === dest)?.name ?? "";

  async function submit() {
    if (!request) return;
    try {
      const res = await copy.mutateAsync(request);
      onOpenChange(false);
      if (outward) {
        toast.success(
          t("doneTo", {
            created: res.created,
            updated: res.updated,
            tree: destName,
          }),
          {
            action: res.rootId
              ? {
                  label: t("openTree"),
                  onClick: () =>
                    router.push(`/app/t/${dest}?focus=${res.rootId}`),
                }
              : undefined,
          },
        );
      } else {
        toast.success(
          t("done", { created: res.created, updated: res.updated }),
        );
      }
      if (res.rootId) onCopied?.(res.rootId, dest);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {outward ? t("titleTo", { name: fromPerson.name }) : t("title")}
          </DialogTitle>
          <DialogDescription>
            {outward ? t("descriptionTo") : t("description")}
          </DialogDescription>
        </DialogHeader>

        {others.length === 0 ? (
          <p className="rounded-lg bg-secondary px-4 py-3 text-sm">
            {outward ? t("noTargets") : t("noSources")}
          </p>
        ) : (
          <div className="space-y-5">
            {outward ? (
              <div className="space-y-1.5">
                <Label>{t("toTree")}</Label>
                <Select value={dest} onValueChange={setDestChoice}>
                  <SelectTrigger className="w-full" aria-label={t("toTree")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {others.map((s) => (
                      <SelectItem key={s._id} value={s._id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {outward ? null : (
              <>
                <div className="space-y-1.5">
                  <Label>{t("fromTree")}</Label>
                  <Select
                    value={source}
                    onValueChange={(v) => {
                      setSourceId(v);
                      setPersonId("");
                    }}
                  >
                    <SelectTrigger
                      className="w-full"
                      aria-label={t("fromTree")}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sources.map((s) => (
                        <SelectItem key={s._id} value={s._id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>{t("startFrom")}</Label>
                  <Command className="rounded-lg border" shouldFilter>
                    <CommandInput placeholder={t("searchPerson")} />
                    <CommandList className="max-h-48">
                      {loadingGraph ? (
                        <div className="flex justify-center p-4">
                          <Loader2
                            className="size-4 animate-spin"
                            aria-hidden
                          />
                        </div>
                      ) : (
                        <CommandEmpty>{t("noPeople")}</CommandEmpty>
                      )}
                      <CommandGroup>
                        {candidates.map((p) => (
                          <CommandItem
                            key={p._id}
                            value={`${p.name} ${p.nickname ?? ""} ${p._id}`}
                            onSelect={() => setPersonId(p._id)}
                          >
                            <PersonAvatar
                              name={p.name}
                              photoUrl={p.photoUrl}
                              gender={p.gender}
                              className="size-7 ring-1 ring-offset-1"
                            />
                            <span className="flex-1 truncate">{p.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {lifeSpan(p.birthDate, p.deathDate)}
                            </span>
                            {p._id === personId ? (
                              <Check
                                className="size-4 text-primary"
                                aria-hidden
                              />
                            ) : null}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                  {graph && candidates.length < graph.people.length ? (
                    <p className="text-xs text-muted-foreground">
                      {t("branchOnly")}
                    </p>
                  ) : null}
                </div>
              </>
            )}

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                {t("howFar", { name: pickedName ?? t("thisPerson") })}
              </legend>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
                {SCOPES.map(({ value, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={scope === value}
                    onClick={() => setScope(value)}
                    className={cn(
                      "flex items-start gap-3 rounded-xl border p-3 text-left text-sm",
                      scope === value && "border-primary bg-secondary",
                    )}
                  >
                    <Icon
                      className="mt-0.5 size-4 shrink-0 text-primary"
                      aria-hidden
                    />
                    <span>
                      <span className="block font-medium">
                        {t(`scopes.${value}.title`)}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {t(`scopes.${value}.body`)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              {scope === "nearby" ? (
                <Select value={steps} onValueChange={setSteps}>
                  <SelectTrigger className="w-40" aria-label={t("steps")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {t("stepsN", { n })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </fieldset>

            <div className="flex items-start justify-between gap-4 rounded-xl border p-3">
              <span>
                <span
                  id="update-existing"
                  className="block text-sm font-medium"
                >
                  {t("updateExisting")}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t("updateExistingHelp")}
                </span>
              </span>
              <Switch
                aria-labelledby="update-existing"
                checked={updateExisting}
                onCheckedChange={setUpdateExisting}
              />
            </div>

            <p className="text-xs text-muted-foreground">{t("whatTravels")}</p>

            {request ? (
              <section
                aria-live="polite"
                className="space-y-2 rounded-xl bg-secondary/60 p-3"
              >
                {preview.isFetching ? (
                  <p className="flex items-center gap-2 text-sm">
                    <Loader2 className="size-4 animate-spin" aria-hidden />{" "}
                    {t("previewing")}
                  </p>
                ) : preview.error ? (
                  <p className="text-sm text-destructive">
                    {errorMessage(preview.error)}
                  </p>
                ) : preview.data ? (
                  <>
                    <p className="text-sm font-medium">
                      {t("previewSummary", {
                        created: preview.data.created,
                        reused: preview.data.reused,
                      })}
                      {preview.data.skipped
                        ? ` ${t("previewSkipped", { skipped: preview.data.skipped })}`
                        : ""}
                    </p>
                    <div className="max-h-40 overflow-y-auto overscroll-contain">
                      <ul className="flex flex-wrap gap-1.5">
                        {(preview.data.people ?? []).map((p) => (
                          <li key={p._id}>
                            <Badge
                              variant={
                                p.alreadyInTree ? "outline" : "secondary"
                              }
                            >
                              {p.name}
                              {p.alreadyInTree ? ` · ${t("alreadyHere")}` : ""}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                ) : null}
              </section>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button
            onClick={submit}
            disabled={
              !request ||
              copy.isPending ||
              preview.isFetching ||
              !preview.data ||
              preview.data.created + preview.data.reused === 0
            }
          >
            {copy.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            {t("copy")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
