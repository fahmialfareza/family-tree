import { redirect } from "next/navigation";

export async function getFamilyTreeData(
  id: string,
  mode: "parent" | "child",
  token?: string
) {
  if (!token) {
    redirect("/auth/login");
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    throw new Error("NEXT_PUBLIC_API_URL environment variable is not set");
  }

  const res = await fetch(`${apiUrl}/api/tree/${id}?mode=${mode}`, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await res.json();
  return data;
}
