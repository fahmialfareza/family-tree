import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/brand";
import { LEGAL_UPDATED } from "@/lib/legal-content";

// Public pages only. Each is listed once per language (?lang=) with hreflang alternates, so both the
// English and the Indonesian version get indexed.
const PAGES: { path: string; priority: number; changeFrequency: "monthly" | "yearly"; lastModified?: string }[] = [
  { path: "/", priority: 1, changeFrequency: "monthly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly", lastModified: LEGAL_UPDATED },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly", lastModified: LEGAL_UPDATED },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return PAGES.flatMap(({ path, priority, changeFrequency, lastModified }) => {
    const languages = { en: `${SITE_URL}${path}?lang=en`, id: `${SITE_URL}${path}?lang=id`, "x-default": `${SITE_URL}${path}?lang=en` };
    return (["id", "en"] as const).map((lang) => ({
      url: languages[lang],
      lastModified: lastModified ? new Date(lastModified) : now,
      changeFrequency,
      priority,
      alternates: { languages },
    }));
  });
}
