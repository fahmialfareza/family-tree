"use client";

import { useTranslations } from "next-intl";
import { SUGGESTIONS_WHATSAPP } from "@/lib/brand";

/** WhatsApp chat with the maintainer, with a greeting already typed (shell "Suggest a feature" entries). */
export function useSuggestLink() {
  const t = useTranslations("shell");
  return `https://wa.me/${SUGGESTIONS_WHATSAPP}?text=${encodeURIComponent(t("suggestMessage"))}`;
}
