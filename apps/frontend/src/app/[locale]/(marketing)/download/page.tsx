import { Globe } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { StoreBadges } from "@/components/marketing/store-badges";
import { Button } from "@/components/ui/button";
import { BRAND, SITE_URL } from "@/lib/brand";
import { type LocaleParams, pageLocale } from "@/i18n/static";
import { jsonLd, languageAlternates, localePath, pageSocial } from "@/lib/seo";
import type { StoreId } from "@/lib/stores";

export async function generateMetadata(props: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(props);
  const t = await getTranslations("download");
  return {
    title: { absolute: t("metaTitle") },
    description: t("metaDescription"),
    alternates: languageAlternates("/download", locale),
    ...pageSocial("/download", locale, t("metaTitle"), t("metaDescription")),
  };
}

export default async function DownloadPage(props: LocaleParams) {
  const locale = await pageLocale(props);
  const t = await getTranslations("download");
  const tm = await getTranslations("marketing");
  const tl = await getTranslations("landing");
  const groups: { title: string; rows: { label: string; store: StoreId }[] }[] = [
    { title: t("phones"), rows: [{ label: t("ios"), store: "appStore" }, { label: t("android"), store: "googlePlay" }] },
    {
      title: t("computers"),
      rows: [
        { label: t("mac"), store: "macAppStore" },
        { label: t("windows"), store: "microsoftStore" },
        { label: t("linux"), store: "snapStore" },
      ],
    },
  ];
  const page = `${SITE_URL}${localePath(locale, "/download")}`;
  // The app itself is described on the landing page (#app); here the page and its place in the site.
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": page, url: page, name: t("metaTitle"), description: t("metaDescription"), inLanguage: locale, about: { "@id": `${SITE_URL}/#app` } },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: BRAND, item: `${SITE_URL}${localePath(locale, "/")}` },
          { "@type": "ListItem", position: 2, name: tm("download"), item: page },
        ],
      },
    ],
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(structuredData)} />
      <section className="mx-auto max-w-3xl space-y-10 px-4 py-16 sm:px-6">
        <header className="space-y-3 text-center">
          <h1 className="font-display text-4xl font-semibold">{t("title")}</h1>
          <p className="text-lg text-muted-foreground">{t("intro")}</p>
        </header>

        {groups.map((g) => (
          <section key={g.title} aria-label={g.title} className="space-y-4">
            <h2 className="font-display text-2xl font-semibold">{g.title}</h2>
            <ul className="divide-y rounded-2xl border bg-card">
              {g.rows.map((r) => (
                <li key={r.store} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <span className="font-medium">{r.label}</span>
                  <StoreBadges only={[r.store]} />
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section aria-label={t("browser")} className="space-y-4">
          <h2 className="font-display text-2xl font-semibold">{t("browser")}</h2>
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card p-4">
            <p className="flex items-center gap-3 text-sm text-muted-foreground">
              <Globe className="size-6 shrink-0 text-primary" aria-hidden /> {t("browserBody")}
            </p>
            <Button asChild>
              <Link href="/auth/signup">{tl("ctaPrimary")}</Link>
            </Button>
          </div>
        </section>

        <p className="text-sm text-muted-foreground">{t("requirements")}</p>
      </section>
    </>
  );
}
