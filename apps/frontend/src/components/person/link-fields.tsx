"use client";

import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ParentKind, PartnerStatus } from "@/lib/api/types";

export const PARENT_KINDS: ParentKind[] = ["birth", "adopted", "step", "foster", "guardian", "milk"];
export const PARTNER_STATUSES: PartnerStatus[] = ["married", "divorced", "separated", "engaged", "partner"];

/** Kandung / angkat / tiri / asuh / wali / susuan. */
export function ParentKindSelect({ value, onChange, label }: { value: ParentKind; onChange: (v: ParentKind) => void; label?: string }) {
  const t = useTranslations("links");
  return (
    <div className="space-y-1.5">
      <Label>{label ?? t("kind")}</Label>
      <Select value={value} onValueChange={(v) => onChange(v as ParentKind)}>
        <SelectTrigger className="w-full" aria-label={label ?? t("kind")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PARENT_KINDS.map((k) => (
            <SelectItem key={k} value={k}>
              {t(`kinds.${k}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Menikah / cerai / pisah / tunangan / pasangan. */
export function PartnerStatusSelect({ value, onChange }: { value: PartnerStatus; onChange: (v: PartnerStatus) => void }) {
  const t = useTranslations("links");
  return (
    <div className="space-y-1.5">
      <Label>{t("status")}</Label>
      <Select value={value} onValueChange={(v) => onChange(v as PartnerStatus)}>
        <SelectTrigger className="w-full" aria-label={t("status")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PARTNER_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {t(`statuses.${s}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
