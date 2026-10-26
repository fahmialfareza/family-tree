"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, Check, DatabaseBackup, FileSpreadsheet, GitFork, Image as ImageIcon, Loader2, Network, Orbit, Printer, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PersonAvatar } from "@/components/common/person-avatar";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGraph } from "@/lib/api/hooks";
import type { ImportScope } from "@/lib/api/types";
import { selectBranch } from "@/lib/branch";
import { lifeSpan } from "@/lib/format";
import { saveFile, useNativePlatform } from "@/lib/native";
import { cn } from "@/lib/utils";

export type ExportFormat = "png" | "print" | "xlsx" | "gedcom" | "json";

const SCOPES: { value: ImportScope; icon: typeof ArrowDown }[] = [
  { value: "descendants", icon: ArrowDown },
  { value: "ancestors", icon: ArrowUp },
  { value: "both", icon: ArrowUpDown },
  { value: "nearby", icon: Orbit },
];
const FORMATS: { value: ExportFormat; icon: typeof ArrowDown; ext: string; file: boolean }[] = [
  { value: "png", icon: ImageIcon, ext: "png", file: false },
  { value: "print", icon: Printer, ext: "", file: false },
  { value: "xlsx", icon: FileSpreadsheet, ext: "xlsx", file: true },
  { value: "gedcom", icon: GitFork, ext: "ged", file: true },
  { value: "json", icon: DatabaseBackup, ext: "json", file: true },
];

function Choice({ selected, onClick, icon: Icon, title, body }: { selected: boolean; onClick: () => void; icon: typeof ArrowDown; title: string; body: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn("flex items-start gap-3 rounded-xl border p-3 text-left text-sm transition-colors hover:bg-accent", selected && "border-primary bg-secondary hover:bg-secondary")}
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <span>
        <span className="block font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{body}</span>
      </span>
    </button>
  );
}

/**
 * Export the whole tree or a branch (like the copy dialog) as an image or a file. Files come from the API
 * (owners only); the image is drawn by the tree page, which this dialog opens with the branch to show.
 */
export function ExportDialog({
  treeId,
  open,
  onOpenChange,
  canExportFiles,
  startPersonId,
}: {
  treeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canExportFiles: boolean;
  startPersonId?: string;
}) {
  const t = useTranslations("export");
  const tc = useTranslations("copy"); // branch choices are worded like the copy dialog
  const locale = useLocale();
  const router = useRouter();
  const { data: graph, isLoading } = useGraph(treeId);
  const [whole, setWhole] = useState(!startPersonId);
  const [personId, setPersonId] = useState(startPersonId ?? "");
  const [scope, setScope] = useState<ImportScope>("descendants");
  const [steps, setSteps] = useState("2");
  const [format, setFormat] = useState<ExportFormat>("png");
  const [busy, setBusy] = useState(false);

  const person = graph?.people.find((p) => p._id === personId);
  const count = useMemo(() => {
    if (!graph) return 0;
    if (whole) return graph.people.length;
    return person ? selectBranch(graph, person._id, scope, Number(steps)).size : 0;
  }, [graph, whole, person, scope, steps]);
  // The app's WebView cannot print; files are for owners.
  const native = useNativePlatform() !== "web";
  const formats = FORMATS.filter((f) => (canExportFiles || !f.file) && !(native && f.value === "print"));
  const ready = !!graph && (whole || !!person);

  async function run() {
    if (!graph || !ready) return;
    const branch = whole ? null : { branch: scope, from: person!._id, ...(scope === "nearby" ? { steps } : {}) };
    if (format === "png" || format === "print") {
      // The tree page draws the branch, then saves or prints the picture (tree-canvas.tsx, ?export=).
      const q = new URLSearchParams({ ...(branch ?? {}), export: format });
      onOpenChange(false);
      router.push(`/app/t/${treeId}?${q.toString()}`);
      return;
    }
    setBusy(true);
    try {
      const q = new URLSearchParams({ format, lang: locale });
      if (branch) {
        q.set("scope", branch.branch);
        q.set("person", branch.from);
        if (branch.steps) q.set("steps", branch.steps);
      }
      const res = await fetch(`/api/proxy/api/trees/${treeId}/export?${q.toString()}`, { credentials: "same-origin" });
      if (!res.ok) throw new Error(res.statusText);
      const ext = FORMATS.find((f) => f.value === format)!.ext;
      const name = `${graph.tree.name}${person && !whole ? ` - ${person.name}` : ""}`.replace(/[\\/:*?"<>|]+/g, "");
      await saveFile(`${name}.${ext}`, await res.blob());
      // The app reports its own downloads (components/native/download-toasts.tsx).
      if (!native) toast.success(t("downloaded"));
      onOpenChange(false);
    } catch {
      toast.error(t("failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">{t("what")}</legend>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
              <Choice selected={whole} onClick={() => setWhole(true)} icon={Network} title={t("whole")} body={t("wholeBody", { tree: graph?.tree.name ?? "" })} />
              <Choice selected={!whole} onClick={() => setWhole(false)} icon={Users} title={t("branch")} body={t("branchBody")} />
            </div>
          </fieldset>

          {whole ? null : (
            <>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">{t("startFrom")}</p>
                <Command className="rounded-lg border" shouldFilter>
                  <CommandInput placeholder={t("search")} />
                  <CommandList className="max-h-48">
                    {isLoading ? (
                      <div className="flex justify-center p-4">
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                      </div>
                    ) : (
                      <CommandEmpty>{t("noPeople")}</CommandEmpty>
                    )}
                    <CommandGroup>
                      {(graph?.people ?? []).map((p) => (
                        <CommandItem key={p._id} value={`${p.name} ${p.nickname ?? ""} ${p._id}`} onSelect={() => setPersonId(p._id)}>
                          <PersonAvatar name={p.name} photoUrl={p.photoUrl} gender={p.gender} className="size-7 ring-1 ring-offset-1" />
                          <span className="flex-1 truncate">{p.name}</span>
                          <span className="text-xs text-muted-foreground">{lifeSpan(p.birthDate, p.deathDate)}</span>
                          {p._id === personId ? <Check className="size-4 text-primary" aria-hidden /> : null}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </div>

              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-medium">{t("howFar", { name: person?.name ?? t("thisPerson") })}</legend>
                <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
                  {SCOPES.map(({ value, icon }) => (
                    <Choice key={value} selected={scope === value} onClick={() => setScope(value)} icon={icon} title={tc(`scopes.${value}.title`)} body={tc(`scopes.${value}.body`)} />
                  ))}
                </div>
                {scope === "nearby" ? (
                  <Select value={steps} onValueChange={setSteps}>
                    <SelectTrigger className="w-40" aria-label={tc("steps")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {tc("stepsN", { n })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
              </fieldset>
            </>
          )}

          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">{t("format")}</legend>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
              {formats.map(({ value, icon }) => (
                <Choice key={value} selected={format === value} onClick={() => setFormat(value)} icon={icon} title={t(`formats.${value}.title`)} body={t(`formats.${value}.body`)} />
              ))}
            </div>
            {canExportFiles ? null : <p className="text-xs text-muted-foreground">{t("ownersOnly")}</p>}
          </fieldset>
        </div>

        <DialogFooter className="items-center gap-3 sm:justify-between">
          <span className="text-sm text-muted-foreground">{ready ? t("count", { count }) : null}</span>
          <Button onClick={run} disabled={!ready || busy || count === 0}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {t("download")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
