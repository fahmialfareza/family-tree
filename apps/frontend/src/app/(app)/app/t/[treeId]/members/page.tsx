import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Members } from "@/components/pages/members";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("shell");
  return { title: t("members") };
}

export default async function Page({ params }: { params: Promise<{ treeId: string }> }) {
  const { treeId } = await params;
  return <Members treeId={treeId} />;
}
