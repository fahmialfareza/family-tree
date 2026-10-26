import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Account } from "@/components/pages/account";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return { title: t("title") };
}

export default function AccountPage() {
  return <Account />;
}
