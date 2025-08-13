import { TRelationship } from "@/models/relationship";
import { redirect } from "next/navigation";

export const getRelationships = async (id: string, token?: string) => {
  if (!token) {
    redirect("/auth/login");
  }

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/relationship/${id}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const data = await res.json();
  return data;
};

export const upsertRelationships = async (
  id: string,
  data: Partial<TRelationship>[],
  token?: string,
  logout?: () => void
) => {
  if (!token) {
    redirect("/auth/login");
  }

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/relationship/${id}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    }
  );
  if (res.status === 401) {
    if (logout) {
      logout();
    }
    redirect("/auth/login");
  }

  const responseData = await res.json();
  return responseData;
};
