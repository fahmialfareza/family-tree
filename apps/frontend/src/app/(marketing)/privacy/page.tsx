import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { LegalPage } from "@/components/common/legal";
import { privacyPolicy } from "@/lib/legal-content";

export async function generateMetadata(): Promise<Metadata> {
  return { title: privacyPolicy(await getLocale()).title };
}

export default async function Page() {
  return <LegalPage {...privacyPolicy(await getLocale())} />;
}
