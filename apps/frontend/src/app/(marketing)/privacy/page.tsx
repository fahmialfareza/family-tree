import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { LegalPage } from "@/components/common/legal";
import { privacyPolicy, terms } from "@/lib/legal-content";

export async function generateMetadata(): Promise<Metadata> {
  const doc = privacyPolicy(await getLocale());
  return { title: doc.title, description: doc.intro };
}

export default async function Page() {
  const locale = await getLocale();
  return <LegalPage doc={privacyPolicy(locale)} otherDoc={{ href: "/terms", title: terms(locale).title }} />;
}
