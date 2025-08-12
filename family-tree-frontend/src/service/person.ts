import { redirect } from "next/navigation";

export const getPeople = async (token?: string) => {
  if (!token) {
    redirect("/auth/login");
  }

  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/person`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await res.json();
  return data;
};

export const getPerson = async (id: string, token?: string) => {
  if (!token) {
    redirect("/auth/login");
  }

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/person/${id}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const data = await res.json();
  return data;
};

export const createPerson = async (data: FormData, token?: string) => {
  if (!token) {
    redirect("/auth/login");
  }

  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/person`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: data,
  });

  const responseData = await res.json();
  return responseData;
};

export const updatePerson = async (data: FormData, token?: string) => {
  if (!token) {
    redirect("/auth/login");
  }

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/person/${data.get("id")}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: data,
    }
  );

  const responseData = await res.json();
  return responseData;
};

export const updateOwnership = async (
  personId: string,
  owners: string[],
  token?: string
) => {
  if (!token) {
    redirect("/auth/login");
  }

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/person/${personId}/ownership`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ owners }),
    }
  );

  const responseData = await res.json();
  return responseData;
};

export const deletePerson = async (id: string, token?: string) => {
  if (!token) {
    redirect("/auth/login");
  }

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/person/${id}`,
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
