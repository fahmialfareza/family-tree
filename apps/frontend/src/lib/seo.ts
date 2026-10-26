import type { Metadata } from "next";
import { BRAND } from "./brand";

/** The language URL of a public page: localePath("id", "/") = "/id", localePath("en", "/privacy") = "/en/privacy". */
export function localePath(locale: string, path: string) {
  return `/${locale}${path === "/" ? "" : path}`;
}

/**
 * hreflang alternates for a public page. Each language has its own URL (/en, /id/privacy); the plain path picks
 * the language per visitor (see middleware.ts) and points its canonical to the version it served. x-default is
 * the English URL, not the plain path, which would conflict with its own canonical.
 */
export function languageAlternates(path: string, locale: string): NonNullable<Metadata["alternates"]> {
  return {
    canonical: localePath(locale, path),
    languages: { en: localePath("en", path), id: localePath("id", path), "x-default": localePath("en", path) },
  };
}

const SHARE_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: `${BRAND} — family tree / silsilah keluarga` };

/**
 * Open Graph + Twitter card for a public page. Next.js replaces (does not merge) the root layout's openGraph
 * when a page sets one, and then also drops the file-based opengraph-image, so every field is set here.
 */
export function pageSocial(path: string, locale: string, title: string, description: string): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: {
      type: "website",
      siteName: BRAND,
      title,
      description,
      url: localePath(locale, path),
      locale: locale === "id" ? "id_ID" : "en_US",
      alternateLocale: locale === "id" ? ["en_US"] : ["id_ID"],
      images: [SHARE_IMAGE],
    },
    twitter: { card: "summary_large_image", title, description, images: [SHARE_IMAGE.url] },
  };
}

/** <script type="application/ld+json"> payload; "<" is escaped so text can never close the tag. */
export function jsonLd(data: unknown) {
  return { __html: JSON.stringify(data).replace(/</g, "\\u003c") };
}
