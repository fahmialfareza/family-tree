"use client";

import { MapPin, Search, UserRoundPlus, UsersRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useDeferredValue, useState } from "react";
import { EmptyState, PageContainer, PageHeader } from "@/components/common/page";
import { PersonAvatar } from "@/components/common/person-avatar";
import { PersonForm } from "@/components/person/person-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe, usePeoplePage } from "@/lib/api/hooks";
import { lifeSpan } from "@/lib/format";

export function PeopleList({ treeId }: { treeId: string }) {
  const t = useTranslations("people");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query.trim());
  const { data, isLoading } = usePeoplePage(treeId, q);
  const { data: me } = useMe();
  const role = me?.trees.find((x) => x._id === treeId)?.role ?? "viewer";
  const [adding, setAdding] = useState(false);
  const people = data?.items ?? [];

  return (
    <PageContainer>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          role !== "viewer" ? (
            <Button onClick={() => setAdding(true)}>
              <UserRoundPlus className="size-4" aria-hidden /> {t("add")}
            </Button>
          ) : undefined
        }
      />
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="pl-9" type="search" />
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : people.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title={q ? t("noMatches") : t("emptyTitle")}
          description={q ? undefined : role === "viewer" ? t("emptyViewer") : t("emptyBody")}
          action={
            !q && role !== "viewer" ? (
              <Button onClick={() => setAdding(true)}>
                <UserRoundPlus className="size-4" aria-hidden /> {t("add")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2" aria-label={t("title")}>
          {people.map((p) => (
            <li key={p._id}>
              <Link
                href={`/app/t/${treeId}?focus=${p._id}&person=${p._id}`}
                className="flex items-center gap-4 rounded-xl border bg-card p-4 shadow-[var(--shadow-soft)] transition-shadow hover:shadow-[var(--shadow-lift)] focus-visible:ring-2 focus-visible:ring-ring"
              >
                <PersonAvatar name={p.name} photoUrl={p.photoUrl} gender={p.gender} deceased={p.status === "deceased"} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {[p.nickname, lifeSpan(p.birthDate, p.deathDate)].filter(Boolean).join(" · ") || " "}
                  </span>
                  {p.birthPlace ? (
                    <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                      <MapPin className="size-3" aria-hidden /> {p.birthPlace}
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {data?.nextCursor ? <p className="text-center text-sm text-muted-foreground">{t("refineSearch")}</p> : null}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("add")}</DialogTitle>
            <DialogDescription>{t("addHint")}</DialogDescription>
          </DialogHeader>
          <PersonForm
            treeId={treeId}
            onSaved={(p) => {
              setAdding(false);
              router.push(`/app/t/${treeId}?focus=${p._id}&person=${p._id}&tab=relatives`);
            }}
            onCancel={() => setAdding(false)}
          />
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
