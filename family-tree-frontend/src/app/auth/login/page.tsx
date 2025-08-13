import { Metadata } from "next";
import LoginComponent from "@/components/Login";
import { cookies } from "next/headers";
import { getProfile } from "@/service/auth";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Login | Family Tree",
  description: "Login to your account",
};

async function Login() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (token) {
    const { status } = await getProfile(token);
    if (status === 200) {
      redirect("/");
    }
  }

  return <LoginComponent />;
}

export default Login;
