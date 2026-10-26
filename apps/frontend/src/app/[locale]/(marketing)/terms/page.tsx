import type { Metadata } from "next";
import { LegalPage } from "@/components/common/legal";
import { privacyPolicy, terms } from "@/lib/legal-content";
import { BRAND } from "@/lib/brand";
import { type LocaleParams, pageLocale } from "@/i18n/static";
import { languageAlternates, localePath, pageSocial } from "@/lib/seo";

export async function generateMetadata(props: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(props);
  const doc = terms(locale);
  return {
    title: doc.title,
    description: doc.intro,
    alternates: languageAlternates("/terms", locale),
    ...pageSocial("/terms", locale, `${doc.title} · ${BRAND}`, doc.intro),
  };
}

export default async function Page(props: LocaleParams) {
  const locale = await pageLocale(props);
  return <LegalPage doc={terms(locale)} otherDoc={{ href: localePath(locale, "/privacy"), title: privacyPolicy(locale).title }} />;
}
