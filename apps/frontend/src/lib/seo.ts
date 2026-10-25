import type { Metadata } from "next";
import { BRAND } from "./brand";

/**
 * hreflang alternates for a public page. The page itself is locale-free (language from account, cookie or
 * country), so each language gets a ?lang= URL that search engines can index; x-default is the plain path.
 * The canonical URL is the version in the language being served.
 */
export function languageAlternates(path: string, locale: string): NonNullable<Metadata["alternates"]> {
  const url = (l: string) => `${path}?lang=${l}`;
  return { canonical: url(locale), languages: { en: url("en"), id: url("id"), "x-default": path } };
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
      url: `${path}?lang=${locale}`,
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
