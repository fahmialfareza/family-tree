"use client";

import { Check, GitBranch, Loader2, Pencil, RotateCcw, UserRoundPlus, Users, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { AssistantAction, AssistantPersonFields } from "@/lib/api/types";
import { cn } from "@/lib/utils";

export type ActionState = AssistantAction & {
  state: "pending" | "applying" | "done" | "failed" | "dismissed";
  error?: string;
  resultPersonId?: string;
};

const ICONS = {
  add_person: UserRoundPlus,
  update_person: Pencil,
  add_relationship: GitBranch,
  add_family: Users,
  rename_family: Users,
} as const;

const FIELD_ORDER: (keyof AssistantPersonFields)[] = [
  "name", "nickname", "gender", "status", "birthDate", "birthPlace", "deathDate", "deathPlace", "address", "notes",
];

/** Card title, also used to tell the model afterwards which changes were applied. */
export function useActionTitle() {
  const t = useTranslations("assistant.actions");
  return (a: AssistantAction) => {
    const relation = a.relation ? t(`relation.${a.relation}`) : "";
    const name = a.fields?.name ?? a.personName ?? "";
    switch (a.type) {
      case "add_person":
        if (a.relation === "child" && a.otherParentName) return t("addChildOf2", { name, relative: a.relativeName ?? "", other: a.otherParentName });
        return a.relation ? t("addPersonAs", { name, relation, relative: a.relativeName ?? "" }) : t("addPerson", { name });
      case "update_person":
        return t("updatePerson", { name: a.personName ?? "" });
      case "add_relationship":
        return t("addRelationship", { name: a.personName ?? "", relation, relative: a.relativeName ?? "" });
      case "add_family":
        return t("addFamily", { family: a.familyName ?? "", name: a.personName ?? "" });
      case "rename_family":
        return t("renameFamily", { family: a.familyName ?? "" });
    }
  };
}

function FieldList({ fields }: { fields: AssistantPersonFields }) {
  const t = useTranslations("assistant.actions");
  const tp = useTranslations("person");
  // Field names match the person form's labels.
  const label = (k: keyof AssistantPersonFields) => tp(k);
  const value = (k: keyof AssistantPersonFields) => {
    const v = fields[k];
    if (v === "") return t("cleared");
    if (k === "gender") return t(`gender.${v}`);
    if (k === "status") return t(`status.${v}`);
    if (k === "birthDate" || k === "deathDate") {
      const q = k === "birthDate" ? fields.birthDateQualifier : fields.deathDateQualifier;
      const prefix = q ? t(`qualifier.${q}`) : "";
      return prefix ? `${prefix} ${v}` : v;
    }
    return v;
  };
  const keys = FIELD_ORDER.filter((k) => fields[k] !== undefined);
  if (!keys.length) return null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
      {keys.map((k) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{label(k)}</dt>
          <dd className="min-w-0 whitespace-pre-wrap break-words">{value(k)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Proposed changes under an assistant answer: each applies only when the user presses Apply. */
export function ActionCards({
  treeId,
  actions,
  busy,
  onApply,
  onApplyAll,
  onDismiss,
}: {
  treeId: string;
  actions: ActionState[];
  busy: boolean;
  onApply: (id: string) => void;
  onApplyAll: () => void;
  onDismiss: (id: string) => void;
}) {
  const t = useTranslations("assistant.actions");
  const title = useActionTitle();
  const pending = actions.filter((a) => a.state === "pending" || a.state === "failed").length;
  return (
    <div className="space-y-2 pt-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("title")}</p>
        {pending > 1 ? (
          <Button size="sm" onClick={onApplyAll} disabled={busy}>
            <Check className="size-4" aria-hidden /> {t("applyAll")}
          </Button>
        ) : null}
      </div>
      <ul className="space-y-2">
        {actions.map((a) => {
          const Icon = ICONS[a.type];
          const done = a.state === "done";
          const dismissed = a.state === "dismissed";
          return (
            <li
              key={a.id}
              className={cn(
                "space-y-2 rounded-xl border bg-background p-3",
                done && "border-primary/40 bg-primary/5",
                dismissed && "opacity-60",
                a.state === "failed" && "border-destructive/50",
              )}
            >
              <p className="flex items-start gap-2 text-sm font-medium">
                <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <span className={cn(dismissed && "line-through")}>{title(a)}</span>
              </p>
              {a.fields && !dismissed ? <FieldList fields={a.fields} /> : null}
              {a.state === "failed" && a.error ? <p className="text-sm text-destructive">{a.error}</p> : null}
              <div className="flex flex-wrap items-center gap-2">
                {a.state === "pending" || a.state === "failed" ? (
                  <>
                    <Button size="sm" onClick={() => onApply(a.id)} disabled={busy}>
                      {a.state === "failed" ? <RotateCcw className="size-4" aria-hidden /> : <Check className="size-4" aria-hidden />}
                      {a.state === "failed" ? t("retry") : t("apply")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onDismiss(a.id)} disabled={busy}>
                      <X className="size-4" aria-hidden /> {t("dismiss")}
                    </Button>
                  </>
                ) : null}
                {a.state === "applying" ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label={t("apply")} /> : null}
                {done ? (
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                    <Check className="size-4" aria-hidden /> {t("applied")}
                  </span>
                ) : null}
                {done && a.resultPersonId ? (
                  <Link
                    href={`/app/t/${treeId}?focus=${a.resultPersonId}&person=${a.resultPersonId}`}
                    className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {t("open")}
                  </Link>
                ) : null}
                {dismissed ? <span className="text-sm text-muted-foreground">{t("dismissed")}</span> : null}
              </div>
            </li>
          );
        })}
      </ul>
      {pending ? <p className="text-xs text-muted-foreground">{t("note")}</p> : null}
    </div>
  );
}
