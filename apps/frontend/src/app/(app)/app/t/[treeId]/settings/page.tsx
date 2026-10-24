import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TreeSettings } from "@/components/pages/tree-settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("shell");
  return { title: t("settings") };
}

export default async function Page({ params }: { params: Promise<{ treeId: string }> }) {
  const { treeId } = await params;
  return <TreeSettings treeId={treeId} />;
}
