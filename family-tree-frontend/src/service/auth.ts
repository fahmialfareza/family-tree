export async function login(username: string, password: string) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/auth/signin`,
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

export async function getProfile(token: string) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json();
  return data;
}
