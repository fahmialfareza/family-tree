"use client";

import { ArrowRight, Check, Copy, Loader2, Sparkles } from "lucide-react";
import { CopyDialog, useCopySources } from "@/components/copy/copy-dialog";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Field, FormError } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, errorMessage } from "@/lib/api/client";
import { useCreateTree } from "@/lib/api/hooks";
import type { Gender, Person } from "@/lib/api/types";
import { cn } from "@/lib/utils";

type Step = 0 | 1 | 2;

/** First run: name a tree, add yourself, optionally your parents, then land on the canvas centered on you. */
export function Onboarding({ userName, isFirstTree }: { userName: string; isFirstTree: boolean }) {
  const t = useTranslations("onboarding");
  const tp = useTranslations("person");
  const createTree = useCreateTree();
  const [step, setStep] = useState<Step>(0);
  const [treeName, setTreeName] = useState(isFirstTree ? t("defaultTreeName", { name: userName.split(" ").slice(-1)[0] }) : "");
  const [treeId, setTreeId] = useState("");
  const [selfName, setSelfName] = useState(userName);
  const [gender, setGender] = useState<Gender>("unknown");
  const [year, setYear] = useState("");
  const [selfId, setSelfId] = useState("");
  const [father, setFather] = useState("");
  const [mother, setMother] = useState("");
  const [busy, setBusy] = useState(false);
  const [copying, setCopying] = useState(false);
  const copySources = useCopySources(treeId);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const createPerson = async (name: string, g: Gender, birthYear?: string) => {
    const fd = new FormData();
    fd.set("name", name);
    fd.set("gender", g);
    fd.set("status", "alive");
    if (birthYear && /^\d{4}$/.test(birthYear)) fd.set("birthDate", birthYear);
    return api.post<Person>(`/api/trees/${treeId}/people`, fd);
  };

  const finish = (focus: string) => window.location.assign(`/app/t/${treeId}?focus=${focus}`);

  const steps = [t("stepTree"), t("stepYou"), t("stepParents")];

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-10">
      <div className="mb-8 text-center">
        <Sparkles className="mx-auto mb-3 size-8 text-terracotta" aria-hidden />
        <h1 className="font-display text-3xl font-semibold">{isFirstTree ? t("welcome", { name: userName.split(" ")[0] }) : t("newTreeTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("intro")}</p>
      </div>
      <ol className="mb-6 flex items-center justify-center gap-2" aria-label={t("progress")}>
        {steps.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-7 items-center justify-center rounded-full border text-xs font-semibold",
                i < step && "border-primary bg-primary text-primary-foreground",
                i === step && "border-primary text-primary",
              )}
              aria-current={i === step ? "step" : undefined}
            >
              {i < step ? <Check className="size-4" aria-hidden /> : i + 1}
            </span>
            <span className={cn("hidden text-sm sm:inline", i === step ? "font-medium" : "text-muted-foreground")}>{label}</span>
            {i < steps.length - 1 ? <span className="h-px w-6 bg-border" aria-hidden /> : null}
          </li>
        ))}
      </ol>

      {treeId ? <CopyDialog treeId={treeId} open={copying} onOpenChange={setCopying} onCopied={(rootId) => finish(rootId)} /> : null}
      <div className="rounded-2xl border bg-card p-6 shadow-[var(--shadow-lift)]">
        <FormError message={error} />
        {step === 0 ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const tree = await createTree.mutateAsync(treeName.trim());
                setTreeId(tree._id);
                setStep(1);
              });
            }}
          >
            <Field label={t("treeName")} hint={t("treeNameHint")} required>
              {(p) => <Input {...p} value={treeName} onChange={(e) => setTreeName(e.target.value)} maxLength={120} autoFocus required />}
            </Field>
            <Button type="submit" className="w-full" disabled={busy || !treeName.trim()}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null} {t("next")} <ArrowRight className="size-4" aria-hidden />
            </Button>
          </form>
        ) : step === 1 ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const me = await createPerson(selfName.trim(), gender, year);
                setSelfId(me._id);
                setStep(2);
              });
            }}
          >
            {copySources.length ? (
              <div className="flex flex-col gap-2 rounded-xl border border-dashed p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span className="text-muted-foreground">{t("copyInstead")}</span>
                <Button type="button" variant="outline" size="sm" onClick={() => setCopying(true)}>
                  <Copy className="size-4" aria-hidden /> {t("copyButton")}
                </Button>
              </div>
            ) : null}
            <p className="text-sm text-muted-foreground">{t("youIntro")}</p>
            <Field label={tp("name")} required>
              {(p) => <Input {...p} value={selfName} onChange={(e) => setSelfName(e.target.value)} maxLength={120} autoFocus required />}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{tp("gender")}</Label>
                <Select value={gender} onValueChange={(v) => setGender(v as Gender)}>
                  <SelectTrigger className="w-full" aria-label={tp("gender")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["female", "male", "other", "unknown"] as const).map((g) => (
                      <SelectItem key={g} value={g}>
                        {tp(`genders.${g}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Field label={t("birthYear")}>
                {(p) => <Input {...p} inputMode="numeric" maxLength={4} value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, ""))} />}
              </Field>
            </div>
            <Button type="submit" className="w-full" disabled={busy || !selfName.trim()}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null} {t("next")} <ArrowRight className="size-4" aria-hidden />
            </Button>
          </form>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const parents: Person[] = [];
                if (father.trim()) parents.push(await createPerson(father.trim(), "male"));
                if (mother.trim()) parents.push(await createPerson(mother.trim(), "female"));
                if (parents.length) {
                  await api.post(
                    `/api/trees/${treeId}/people/${selfId}/relationships`,
                    parents.map((p) => ({ to: p._id, type: "child" })),
                  );
                }
                if (parents.length === 2) {
                  await api.post(`/api/trees/${treeId}/people/${parents[0]._id}/relationships`, [{ to: parents[1]._id, type: "spouse" }, { to: selfId, type: "parent" }]);
                }
                finish(selfId);
              });
            }}
          >
            <p className="text-sm text-muted-foreground">{t("parentsIntro")}</p>
            <Field label={t("father")}>
              {(p) => <Input {...p} value={father} onChange={(e) => setFather(e.target.value)} maxLength={120} autoFocus />}
            </Field>
            <Field label={t("mother")}>
              {(p) => <Input {...p} value={mother} onChange={(e) => setMother(e.target.value)} maxLength={120} />}
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="ghost" onClick={() => finish(selfId)} disabled={busy}>
                {t("skip")}
              </Button>
              <Button type="submit" disabled={busy || (!father.trim() && !mother.trim())}>
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null} {t("finish")}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
