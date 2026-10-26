import type { Metadata } from "next";
import { LegalPage } from "@/components/common/legal";
import { privacyPolicy, terms } from "@/lib/legal-content";
import { BRAND } from "@/lib/brand";
import { type LocaleParams, pageLocale } from "@/i18n/static";
import { languageAlternates, pageSocial } from "@/lib/seo";

export async function generateMetadata(props: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(props);
  const doc = privacyPolicy(locale);
  return {
    title: doc.title,
    description: doc.intro,
    alternates: languageAlternates("/privacy", locale),
    ...pageSocial("/privacy", locale, `${doc.title} · ${BRAND}`, doc.intro),
  };
}

export default async function Page(props: LocaleParams) {
  const locale = await pageLocale(props);
  return <LegalPage doc={privacyPolicy(locale)} otherDoc={{ href: "/terms", title: terms(locale).title }} />;
}
