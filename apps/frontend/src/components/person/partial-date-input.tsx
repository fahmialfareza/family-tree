"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DateQualifier } from "@/lib/api/types";

export type PartialDate = { year: string; month: string; day: string; qualifier: DateQualifier };

const NONE = "none";

/** Year (required for any date), optional month and day, plus "about / before / after". */
export function PartialDateInput({ label, value, onChange }: { label: string; value: PartialDate; onChange: (v: PartialDate) => void }) {
  const t = useTranslations("person");
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const monthName = (m: number) => new Intl.DateTimeFormat(undefined, { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2000, m - 1, 1)));
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 sm:grid-cols-[1.2fr_1fr_1fr_1fr]">
        <Select value={value.qualifier} onValueChange={(q) => onChange({ ...value, qualifier: q as DateQualifier })}>
          <SelectTrigger className="col-span-3 sm:col-span-1" aria-label={t("dateQualifier")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(["exact", "about", "before", "after"] as const).map((q) => (
              <SelectItem key={q} value={q}>
                {t(`qualifier.${q}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div>
          <Label className="sr-only">{t("day")}</Label>
          <Select value={value.day || NONE} onValueChange={(d) => onChange({ ...value, day: d === NONE ? "" : d })} disabled={!value.month}>
            <SelectTrigger aria-label={t("day")}>
              <SelectValue placeholder={t("day")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t("day")}</SelectItem>
              {days.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Select value={value.month || NONE} onValueChange={(m) => onChange({ ...value, month: m === NONE ? "" : m, day: m === NONE ? "" : value.day })} disabled={!value.year}>
          <SelectTrigger aria-label={t("month")}>
            <SelectValue placeholder={t("month")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{t("month")}</SelectItem>
            {months.map((m) => (
              <SelectItem key={m} value={String(m)}>
                {monthName(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          inputMode="numeric"
          placeholder={t("year")}
          aria-label={t("year")}
          value={value.year}
          maxLength={4}
          onChange={(e) => {
            const year = e.target.value.replace(/\D/g, "");
            onChange(year ? { ...value, year } : { ...value, year: "", month: "", day: "" });
          }}
        />
      </div>
    </fieldset>
  );
}
