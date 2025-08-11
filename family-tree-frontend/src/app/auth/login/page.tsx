import { Metadata } from "next";
import LoginComponent from "@/components/Login";

export const metadata: Metadata = {
  title: "Login | Family Tree",
  description: "Login to your account",
};

function Login() {
  return <LoginComponent />;
}

export default Login;
