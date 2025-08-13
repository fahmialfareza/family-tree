import PersonForm from "@/components/PersonForm";
import { getProfile } from "@/service/auth";
import { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { toast } from "react-toastify";

export const metadata: Metadata = {
  title: "Create Person | Family Tree",
  description: "Create a new person in the family tree",
};

export default async function CreatePersonPage() {
  const cookieStore = await cookies();
  const tokenCookie = cookieStore.get("token");
  const token = tokenCookie ? tokenCookie.value : undefined;
  const { status, message } = await getProfile(token);
  if (status === 401) {
    cookieStore.delete("token");
    toast.error(message);
    redirect("/auth/login");
  }

  return (
    <div className="p-8 m-1">
      <PersonForm mode="create" />
    </div>
  );
}
