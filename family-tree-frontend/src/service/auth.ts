import { redirect } from "next/navigation";

export async function login(username: string, password: string) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_FE_API_URL}/api/auth/login`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    }
  );

  const data = await response.json();
  return data;
}

export async function getProfile(token: string, logoutUser: () => void) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (response.status === 401) {
    await logout();
    logoutUser();
    redirect("/auth/login");
  }

  const data = await response.json();
  return data;
}

export async function getUsers(token?: string) {
  if (!token) redirect("/auth/login");

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/auth/users`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const data = await response.json();
  return data;
}

export async function logout() {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_FE_API_URL}/api/auth/logout`,
    {
      method: "POST",
      credentials: "include",
    }
  );

  const { message } = await response.json();
  return message;
}
