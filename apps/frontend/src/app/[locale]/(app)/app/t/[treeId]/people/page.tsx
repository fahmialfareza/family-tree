import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PeopleList } from "@/components/pages/people-list";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("shell");
  return { title: t("people") };
}

export default async function Page({ params }: { params: Promise<{ treeId: string }> }) {
  const { treeId } = await params;
  return <PeopleList treeId={treeId} />;
}
