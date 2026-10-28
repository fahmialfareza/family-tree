"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";
import { PersonAvatar } from "@/components/common/person-avatar";
import { Button } from "@/components/ui/button";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useGraph } from "@/lib/api/hooks";
import { lifeSpan } from "@/lib/format";
import { openAppPage } from "@/lib/offline";

// The shortcut as the keyboard shows it: ⌘K on Apple devices, Ctrl K elsewhere (decided after hydration).
const noSubscribe = () => () => {};
const shortcutLabel = () => (/Mac|iPhone|iPad|iPod/.test(navigator.userAgent) ? "⌘K" : "Ctrl K");

/** ⌘K / Ctrl+K person search for the current tree; picking someone centers the canvas on them. */
export function PersonSearch({ treeId, compact }: { treeId: string; compact?: boolean }) {
  const t = useTranslations("shell");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { data } = useGraph(treeId);
  const shortcut = useSyncExternalStore(noSubscribe, shortcutLabel, () => "⌘K");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {compact ? (
        <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label={t("search")}>
          <Search className="size-5" aria-hidden />
        </Button>
      ) : (
        <Button variant="outline" className="w-full justify-start gap-2 text-muted-foreground" onClick={() => setOpen(true)}>
          <Search className="size-4" aria-hidden />
          <span className="flex-1 text-left">{t("searchPeople")}</span>
          <kbd className="rounded border bg-muted px-1.5 font-mono text-[10px]">{shortcut}</kbd>
        </Button>
      )}
      <CommandDialog open={open} onOpenChange={setOpen} title={t("searchPeople")} description={t("searchHint")}>
        <CommandInput placeholder={t("searchPlaceholder")} />
        <CommandList>
          <CommandEmpty>{t("noMatches")}</CommandEmpty>
          <CommandGroup heading={t("people")}>
            {(data?.people ?? []).map((p) => (
              <CommandItem
                key={p._id}
                value={`${p.name} ${p.nickname ?? ""} ${p._id}`}
                onSelect={() => {
                  setOpen(false);
                  openAppPage(router, `/app/t/${treeId}?focus=${p._id}`);
                }}
              >
                <PersonAvatar name={p.name} photoUrl={p.photoUrl} gender={p.gender} deceased={p.status === "deceased"} className="size-7 ring-1 ring-offset-1" />
                <span className="flex-1 truncate">{p.name}</span>
                <span className="text-xs text-muted-foreground">{lifeSpan(p.birthDate, p.deathDate)}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
