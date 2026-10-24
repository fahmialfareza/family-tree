import { redirect } from "next/navigation";
import type { Me } from "@/lib/api/types";
import { backendGet } from "@/lib/server/backend";

// /app sends people to their first tree (keeping ?focus= from old /tree/:id links) or to onboarding.
export default async function AppHome({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { focus } = await searchParams;
  const me = await backendGet<Me>("/api/me");
  if (me.trees.length === 0) redirect("/app/onboarding");
  redirect(`/app/t/${me.trees[0]._id}${focus ? `?focus=${encodeURIComponent(focus)}` : ""}`);
}
