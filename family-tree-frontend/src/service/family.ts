import { TFamily } from "@/models/family";
import { redirect } from "next/navigation";

export const getFamilies = async (token?: string) => {
  if (!token) {
    redirect("/auth/login");
  }

  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/family`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await res.json();
  return data;
};

export const addFamily = async (family: Partial<TFamily>, token?: string) => {
  if (!token) {
    redirect("/auth/login");
  }

  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/family`, {
    method: "POST",
    body: JSON.stringify({
      name: family.name + " Family's",
      person: family.person,
    }),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await res.json();
  return data;
};

export const deleteFamily = async (id: string, token?: string) => {
  if (!token) {
    redirect("/auth/login");
  }

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/family/${id}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const data = await res.json();
  return data;
};
