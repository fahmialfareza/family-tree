import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { OfflinePage } from "@/components/pages/offline-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("offline");
  return { title: t("pageTitle") };
}

// Shown offline (by public/sw.js) for an app page that has no saved copy, inside the app: header and tabs stay.
export default async function Page({ params }: { params: Promise<{ treeId: string }> }) {
  const { treeId } = await params;
  return <OfflinePage treeId={treeId} />;
}
