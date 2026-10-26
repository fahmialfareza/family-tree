import { Flower2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Gender, Religion } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/**
 * How a deceased person is marked, by their (optional) religion: Alm./Almh. for Muslims, a cross for
 * Christians, otherwise a neutral flower. Families are never shown a symbol of another faith.
 */
export function DeceasedMark({ religion, gender, className }: { religion?: Religion; gender: Gender; className?: string }) {
  const t = useTranslations("person");
  const label = t("statuses.deceased");
  if (religion === "islam") {
    return (
      <span className={cn("text-[10px] font-medium", className)} title={label}>
        {gender === "female" ? t("lateFemale") : t("lateMale")}
      </span>
    );
  }
  if (religion === "protestant" || religion === "catholic") {
    return (
      <span className={cn("text-xs", className)} title={label} aria-hidden>
        †
      </span>
    );
  }
  return <Flower2 className={cn("size-3", className)} aria-hidden />;
}
