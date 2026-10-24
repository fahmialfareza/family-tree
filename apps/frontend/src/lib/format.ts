import type { DatePrecision, DateQualifier } from "@/lib/api/types";

/** Year of an ISO date, or undefined for missing / zero dates (the API sends 0001-01-01 for "unknown"). */
export function yearOf(iso?: string): number | undefined {
  if (!iso) return undefined;
  const y = Number(iso.slice(0, 4));
  return y > 1 ? y : undefined;
}

/** "1950–2010", "b. 1990", "d. 2001" or "" for a node subtitle. */
export function lifeSpan(birth?: string, death?: string): string {
  const b = yearOf(birth);
  const d = yearOf(death);
  if (b && d) return `${b}–${d}`;
  if (b) return `${b}`;
  if (d) return `† ${d}`;
  return "";
}

/** Formats a date at its stored precision with an optional qualifier ("about 1950", "March 1950"). */
export function formatPartialDate(
  iso: string | undefined,
  precision: DatePrecision | undefined,
  qualifier: DateQualifier | undefined,
  locale: string,
  qualifierLabel: (q: DateQualifier) => string,
): string {
  if (!yearOf(iso)) return "";
  const d = new Date(iso!);
  const p = precision ?? "day";
  const opts: Intl.DateTimeFormatOptions =
    p === "year" ? { year: "numeric", timeZone: "UTC" } : p === "month" ? { year: "numeric", month: "long", timeZone: "UTC" } : { dateStyle: "long", timeZone: "UTC" };
  const text = new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-GB", opts).format(d);
  return qualifier && qualifier !== "exact" ? `${qualifierLabel(qualifier)} ${text}` : text;
}

/** Splits an ISO date into form parts according to its precision. */
export function dateParts(iso?: string, precision?: DatePrecision): { year: string; month: string; day: string } {
  if (!yearOf(iso)) return { year: "", month: "", day: "" };
  const [y, m, d] = iso!.slice(0, 10).split("-");
  const p = precision ?? "day";
  return { year: y, month: p === "year" ? "" : String(Number(m)), day: p === "day" ? String(Number(d)) : "" };
}

/** Builds the API date value ("YYYY", "YYYY-MM", "YYYY-MM-DD") from form parts; "" when unknown. */
export function partsToValue(year: string, month: string, day: string): string {
  if (!/^\d{3,4}$/.test(year)) return "";
  const y = year.padStart(4, "0");
  if (!month) return y;
  const m = month.padStart(2, "0");
  if (!day) return `${y}-${m}`;
  return `${y}-${m}-${day.padStart(2, "0")}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

/** Normalizes a phone number to E.164-ish form for links: Indonesian local numbers (0…) get +62. */
export function toE164(phone: string, defaultCountryCode = "62"): string {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.startsWith("0")) return `+${defaultCountryCode}${digits.slice(1)}`;
  return digits ? `+${digits}` : "";
}

export function whatsappLink(phone: string): string {
  return `https://wa.me/${toE164(phone).replace("+", "")}`;
}
