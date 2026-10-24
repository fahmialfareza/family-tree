import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FamiliesList } from "@/components/pages/families-list";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("shell");
  return { title: t("families") };
}

export default async function Page({ params }: { params: Promise<{ treeId: string }> }) {
  const { treeId } = await params;
  return <FamiliesList treeId={treeId} />;
}
