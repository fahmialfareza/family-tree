import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Onboarding } from "@/components/onboarding/onboarding";
import type { Me } from "@/lib/api/types";
import { backendGet } from "@/lib/server/backend";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("onboarding");
  return { title: t("title") };
}

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { new: wantsNew } = await searchParams;
  const me = await backendGet<Me>("/api/me");
  if (me.trees.length > 0 && !wantsNew) redirect(`/app/t/${me.trees[0]._id}`);
  return <Onboarding userName={me.user.name} isFirstTree={me.trees.length === 0} />;
}
