"use client";

import { Camera, Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Field, FormError } from "@/components/common/field";
import { PersonAvatar } from "@/components/common/person-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api/client";
import { useSavePerson } from "@/lib/api/hooks";
import type { Gender, LifeStatus, Person } from "@/lib/api/types";
import { dateParts, partsToValue } from "@/lib/format";
import { compressImage } from "@/lib/image";
import { PartialDate, PartialDateInput } from "./partial-date-input";

function initialDate(iso?: string, precision?: Person["birthDatePrecision"], qualifier?: Person["birthDateQualifier"]): PartialDate {
  return { ...dateParts(iso, precision), qualifier: qualifier ?? "exact" };
}

/** Create or edit a person. Only the name is required. */
export function PersonForm({
  treeId,
  person,
  onSaved,
  onCancel,
}: {
  treeId: string;
  person?: Person;
  onSaved: (p: Person) => void;
  onCancel?: () => void;
}) {
  const t = useTranslations("person");
  const tc = useTranslations("common");
  const save = useSavePerson(treeId);
  const [name, setName] = useState(person?.name ?? "");
  const [nickname, setNickname] = useState(person?.nickname ?? "");
  const [gender, setGender] = useState<Gender>(person?.gender ?? "unknown");
  const [status, setStatus] = useState<LifeStatus>(person?.status ?? "alive");
  const [birth, setBirth] = useState(initialDate(person?.birthDate, person?.birthDatePrecision, person?.birthDateQualifier));
  const [death, setDeath] = useState(initialDate(person?.deathDate, person?.deathDatePrecision, person?.deathDateQualifier));
  const [birthPlace, setBirthPlace] = useState(person?.birthPlace ?? "");
  const [deathPlace, setDeathPlace] = useState(person?.deathPlace ?? "");
  const [phone, setPhone] = useState(person?.phone ?? "");
  const [address, setAddress] = useState(person?.address ?? "");
  const [notes, setNotes] = useState(person?.notes ?? "");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  async function pickPhoto(file?: File) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error(t("photoTooLarge"));
      return;
    }
    setCompressing(true);
    try {
      const small = await compressImage(file);
      if (small.size > 5 * 1024 * 1024) throw new Error("too-large");
      setPhoto(small);
      setPreview(URL.createObjectURL(small));
    } catch {
      toast.error(t("photoInvalid"));
    } finally {
      setCompressing(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError(t("nameRequired"));
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("name", name.trim());
    fd.set("nickname", nickname.trim());
    fd.set("gender", gender);
    fd.set("status", status);
    fd.set("birthDate", partsToValue(birth.year, birth.month, birth.day));
    fd.set("birthDateQualifier", birth.year ? birth.qualifier : "");
    fd.set("birthPlace", birthPlace.trim());
    fd.set("deathDate", status === "deceased" ? partsToValue(death.year, death.month, death.day) : "");
    fd.set("deathDateQualifier", status === "deceased" && death.year ? death.qualifier : "");
    fd.set("deathPlace", status === "deceased" ? deathPlace.trim() : "");
    fd.set("phone", phone.trim());
    fd.set("address", address.trim());
    fd.set("notes", notes.trim());
    if (photo) fd.set("photo", photo);
    try {
      const saved = await save.mutateAsync({ id: person?._id, form: fd });
      toast.success(person ? t("saved") : t("created"));
      onSaved(saved);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <FormError message={error} />
      <div className="flex items-center gap-4">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="size-16 rounded-full object-cover" />
        ) : (
          <PersonAvatar name={name || "?"} photoUrl={person?.photoUrl} gender={gender} className="size-16" />
        )}
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(e) => pickPhoto(e.target.files?.[0])} aria-label={t("photo")} />
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={compressing}>
            {compressing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Camera className="size-4" aria-hidden />}
            {person?.photoUrl || preview ? t("changePhoto") : t("addPhoto")}
          </Button>
          {preview ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setPhoto(null);
                setPreview(null);
              }}
            >
              <Trash2 className="size-4" aria-hidden /> {tc("remove")}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("name")} required className="sm:col-span-2">
          {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus={!person} required />}
        </Field>
        <Field label={t("nickname")} hint={t("nicknameHint")}>
          {(p) => <Input {...p} value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={60} />}
        </Field>
        <div className="space-y-1.5">
          <Label>{t("gender")}</Label>
          <Select value={gender} onValueChange={(v) => setGender(v as Gender)}>
            <SelectTrigger className="w-full" aria-label={t("gender")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["female", "male", "other", "unknown"] as const).map((g) => (
                <SelectItem key={g} value={g}>
                  {t(`genders.${g}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>{t("status")}</Label>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("status")}>
            {(["alive", "deceased"] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={status === s}
                onClick={() => setStatus(s)}
                className="rounded-lg border px-3 py-2 text-sm font-medium aria-checked:border-primary aria-checked:bg-secondary"
              >
                {t(`statuses.${s}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <PartialDateInput label={t("birthDate")} value={birth} onChange={setBirth} />
      <Field label={t("birthPlace")}>
        {(p) => <Input {...p} value={birthPlace} onChange={(e) => setBirthPlace(e.target.value)} maxLength={200} />}
      </Field>
      {status === "deceased" ? (
        <>
          <PartialDateInput label={t("deathDate")} value={death} onChange={setDeath} />
          <Field label={t("deathPlace")}>
            {(p) => <Input {...p} value={deathPlace} onChange={(e) => setDeathPlace(e.target.value)} maxLength={200} />}
          </Field>
        </>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("phone")} hint={t("phoneHint")}>
          {(p) => <Input {...p} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={32} autoComplete="off" />}
        </Field>
        <Field label={t("address")}>
          {(p) => <Input {...p} value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} />}
        </Field>
      </div>
      <Field label={t("notes")} hint={t("notesHint")}>
        {(p) => <Textarea {...p} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} rows={4} />}
      </Field>

      <div className="sticky bottom-0 -mx-1 flex justify-end gap-2 bg-background/95 px-1 py-3 backdrop-blur">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {tc("cancel")}
          </Button>
        ) : null}
        <Button type="submit" disabled={save.isPending || compressing}>
          {save.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {person ? tc("save") : t("addPerson")}
        </Button>
      </div>
    </form>
  );
}
