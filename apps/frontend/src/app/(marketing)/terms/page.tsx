import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { LegalPage } from "@/components/common/legal";
import { terms } from "@/lib/legal-content";

export async function generateMetadata(): Promise<Metadata> {
  return { title: terms(await getLocale()).title };
}

export default async function Page() {
  return <LegalPage {...terms(await getLocale())} />;
}
