import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { LegalPage } from "@/components/common/legal";
import { privacyPolicy, terms } from "@/lib/legal-content";
import { BRAND } from "@/lib/brand";
import { languageAlternates, pageSocial } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const doc = privacyPolicy(locale);
  return {
    title: doc.title,
    description: doc.intro,
    alternates: languageAlternates("/privacy", locale),
    ...pageSocial("/privacy", locale, `${doc.title} · ${BRAND}`, doc.intro),
  };
}

export default async function Page() {
  const locale = await getLocale();
  return <LegalPage doc={privacyPolicy(locale)} otherDoc={{ href: "/terms", title: terms(locale).title }} />;
}
