"use client";

import { Copy, Crosshair, Heart, Loader2, RefreshCw, MapPin, MessageCircle, Pencil, Phone, Trash2, UserRoundPlus, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PersonAvatar } from "@/components/common/person-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { errorMessage } from "@/lib/api/client";
import { useDeletePerson, usePerson, useSyncFromOriginal } from "@/lib/api/hooks";
import type { Graph, TreeRole } from "@/lib/api/types";
import { formatPartialDate, whatsappLink } from "@/lib/format";
import { useMediaQuery } from "@/lib/use-media-query";
import { PersonForm } from "./person-form";
import { RelativesPanel } from "./relatives-panel";
import { SharingPanel } from "./sharing-panel";

export function PersonDrawer({
  treeId,
  personId,
  graph,
  role,
  tab,
  onTabChange,
  onClose,
  onFocus,
  onAddRelative,
  onCopyOut,
}: {
  treeId: string;
  personId: string | null;
  graph: Graph | undefined;
  role: TreeRole;
  tab: string;
  onTabChange: (tab: string) => void;
  onClose: () => void;
  onFocus: (id: string) => void;
  onAddRelative: (anchorId: string, kind: "parent" | "spouse" | "child") => void;
  onCopyOut?: (personId: string, name: string) => void;
}) {
  const t = useTranslations("drawer");
  const tp = useTranslations("person");
  const tc = useTranslations("common");
  const tcv = useTranslations("canvas");
  const tcp = useTranslations("copy");
  const sync = useSyncFromOriginal(treeId);
  const locale = useLocale();
  const desktop = useMediaQuery("(min-width: 768px)", true);
  const { data: person, isLoading } = usePerson(treeId, personId);
  const del = useDeletePerson(treeId);
  const summary = graph?.people.find((p) => p._id === personId);
  const canEdit = role !== "viewer" && !!summary?.canEdit;
  const showSharing = role === "owner" && !!graph?.tree.branchScoped;
  const q = (x: "exact" | "about" | "before" | "after") => tp(`qualifier.${x}`);

  return (
    <Sheet open={!!personId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side={desktop ? "right" : "bottom"}
        className={desktop ? "w-full gap-0 p-0 sm:max-w-lg" : "max-h-[88dvh] gap-0 rounded-t-2xl p-0"}
      >
        <SheetHeader className="border-b p-5">
          {person ? (
            <div className="flex items-center gap-4">
              <PersonAvatar name={person.name} photoUrl={person.photoUrl} gender={person.gender} deceased={person.status === "deceased"} className="size-16" />
              <div className="min-w-0">
                <SheetTitle className="font-display text-xl">{person.name}</SheetTitle>
                <SheetDescription className="flex flex-wrap items-center gap-2">
                  {person.nickname ? <span>“{person.nickname}”</span> : null}
                  <Badge variant="secondary">{tp(`statuses.${person.status}`)}</Badge>
                </SheetDescription>
              </div>
            </div>
          ) : (
            <>
              <SheetTitle className="sr-only">{t("loading")}</SheetTitle>
              <SheetDescription className="sr-only">{t("loading")}</SheetDescription>
              <div className="flex items-center gap-4">
                <Skeleton className="size-16 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </div>
            </>
          )}
        </SheetHeader>

        {isLoading || !person ? (
          <div className="flex justify-center p-10">
            <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label={t("loading")} />
          </div>
        ) : (
          <Tabs value={tab} onValueChange={onTabChange} className="flex min-h-0 flex-1 flex-col">
            <TabsList className="mx-5 mt-4 grid h-11 w-auto grid-cols-[repeat(auto-fit,minmax(0,1fr))] md:h-9">
              <TabsTrigger value="overview">{t("overview")}</TabsTrigger>
              <TabsTrigger value="relatives">{t("relatives")}</TabsTrigger>
              {canEdit ? <TabsTrigger value="edit">{t("edit")}</TabsTrigger> : null}
              {showSharing ? <TabsTrigger value="sharing">{t("sharing")}</TabsTrigger> : null}
            </TabsList>
            {/* A plain scroll container: Radix ScrollArea's viewport is height:100%, which never resolves inside
                the phone bottom sheet (max-height only), so its content could not scroll there. */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                <TabsContent value="overview" className="mt-0 space-y-5">
                  {canEdit ? (
                    <div className="flex flex-wrap gap-2" role="toolbar" aria-label={tcv("personActions", { name: person.name })}>
                      <Button size="sm" onClick={() => onTabChange("edit")}>
                        <Pencil className="size-4" aria-hidden /> {tcv("editPerson")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => onAddRelative(person._id, "parent")}>
                        <Users className="size-4" aria-hidden /> {tcv("addParent")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => onAddRelative(person._id, "spouse")}>
                        <Heart className="size-4" aria-hidden /> {tcv("addSpouse")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => onAddRelative(person._id, "child")}>
                        <UserRoundPlus className="size-4" aria-hidden /> {tcv("addChild")}
                      </Button>
                      {onCopyOut ? (
                        <Button size="sm" variant="ghost" onClick={() => onCopyOut(person._id, person.name)}>
                          <Copy className="size-4" aria-hidden /> {tcv("copyToTree")}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                  {person.copiedFrom ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed p-3 text-sm">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <Copy className="size-4" aria-hidden />
                        {person.copiedFrom.treeName ? tcp("copiedFrom", { tree: person.copiedFrom.treeName }) : tcp("copiedFromOther")}
                      </span>
                      {person.copiedFrom.canUpdate && canEdit ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={sync.isPending}
                          onClick={async () => {
                            try {
                              await sync.mutateAsync(person._id);
                              toast.success(tcp("updated"));
                            } catch (err) {
                              toast.error(errorMessage(err));
                            }
                          }}
                        >
                          {sync.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
                          {tcp("updateFromOriginal")}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                  <dl className="grid gap-4 text-sm">
                    {[
                      [tp("birthDate"), formatPartialDate(person.birthDate, person.birthDatePrecision, person.birthDateQualifier, locale, q), person.birthPlace],
                      ...(person.status === "deceased"
                        ? [[tp("deathDate"), formatPartialDate(person.deathDate, person.deathDatePrecision, person.deathDateQualifier, locale, q), person.deathPlace]]
                        : []),
                    ].map(([label, date, place]) => (
                      <div key={label}>
                        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
                        <dd className="mt-0.5">{date || <span className="text-muted-foreground">{t("unknown")}</span>}</dd>
                        {place ? (
                          <dd className="mt-0.5 flex items-center gap-1 text-muted-foreground">
                            <MapPin className="size-3.5" aria-hidden /> {place}
                          </dd>
                        ) : null}
                      </div>
                    ))}
                    {person.address ? (
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{tp("address")}</dt>
                        <dd className="mt-0.5">{person.address}</dd>
                      </div>
                    ) : null}
                    {person.notes ? (
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{tp("notes")}</dt>
                        <dd className="mt-0.5 whitespace-pre-wrap">{person.notes}</dd>
                      </div>
                    ) : null}
                  </dl>
                  {person.phone ? (
                    <div className="flex flex-wrap gap-2">
                      <Button asChild variant="outline" size="sm">
                        <a href={`tel:${person.phone.replace(/[^\d+]/g, "")}`}>
                          <Phone className="size-4" aria-hidden /> {person.phone}
                        </a>
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <a href={whatsappLink(person.phone)} target="_blank" rel="noopener noreferrer">
                          <MessageCircle className="size-4" aria-hidden /> WhatsApp
                        </a>
                      </Button>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2 border-t pt-4">
                    <Button variant="secondary" size="sm" onClick={() => onFocus(person._id)}>
                      <Crosshair className="size-4" aria-hidden /> {t("centerHere")}
                    </Button>
                    {canEdit ? (
                      <ConfirmDialog
                        trigger={
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                            <Trash2 className="size-4" aria-hidden /> {tc("delete")}
                          </Button>
                        }
                        title={t("deleteTitle", { name: person.name })}
                        description={t("deleteBody")}
                        confirmLabel={tc("delete")}
                        onConfirm={async () => {
                          try {
                            await del.mutateAsync(person._id);
                            toast.success(t("deleted"));
                            onClose();
                          } catch (err) {
                            toast.error(errorMessage(err));
                          }
                        }}
                      />
                    ) : null}
                  </div>
                </TabsContent>
                <TabsContent value="relatives" className="mt-0">
                  <RelativesPanel treeId={treeId} personId={person._id} graph={graph} canEdit={canEdit} onFocus={onFocus} onAddRelative={onAddRelative} />
                </TabsContent>
                {canEdit ? (
                  <TabsContent value="edit" className="mt-0">
                    <PersonForm key={person._id} treeId={treeId} person={person} onSaved={() => onTabChange("overview")} onCancel={() => onTabChange("overview")} />
                  </TabsContent>
                ) : null}
                {showSharing ? (
                  <TabsContent value="sharing" className="mt-0">
                    <SharingPanel treeId={treeId} person={person} />
                  </TabsContent>
                ) : null}
              </div>
            </div>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}
