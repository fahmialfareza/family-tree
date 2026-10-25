import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Assistant } from "@/components/pages/assistant";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("shell");
  return { title: t("ask") };
}

export default async function Page({ params }: { params: Promise<{ treeId: string }> }) {
  const { treeId } = await params;
  return <Assistant treeId={treeId} />;
}
