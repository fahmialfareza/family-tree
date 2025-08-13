import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { username, password } = await request.json();

  const apiResponse = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/auth/signin`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    }
  );

  const data = await apiResponse.json();

  if (apiResponse.ok && data?.data?.token) {
    const response = NextResponse.json(data);
    response.cookies.set("token", data.data.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      sameSite: "lax",
    });
    return response;
  }

  return NextResponse.json(data, { status: apiResponse.status });
}
