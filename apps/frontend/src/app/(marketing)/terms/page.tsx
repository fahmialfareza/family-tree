import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { LegalPage } from "@/components/common/legal";
import { privacyPolicy, terms } from "@/lib/legal-content";
import { BRAND } from "@/lib/brand";
import { languageAlternates, pageSocial } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const doc = terms(locale);
  return {
    title: doc.title,
    description: doc.intro,
    alternates: languageAlternates("/terms", locale),
    ...pageSocial("/terms", locale, `${doc.title} · ${BRAND}`, doc.intro),
  };
}

export default async function Page() {
  const locale = await getLocale();
  return <LegalPage doc={terms(locale)} otherDoc={{ href: "/privacy", title: privacyPolicy(locale).title }} />;
}
