import { cookies } from "next/headers";
import PersonTable from "@/components/PersonTable";
import { getPeople } from "@/service/person";
import { toast } from "react-toastify";
import { redirect } from "next/navigation";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Family Tree | People",
  description:
    "Manage your family tree by adding, editing, and viewing people.",
};

async function Tree() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  const { data, message } = await getPeople(token);
  if (!data) {
    toast.error(message);
    redirect("/auth/login");
  }

  return (
    <div className="p-8 m-8 bg-white rounded-lg shadow">
      <PersonTable data={data} />
    </div>
  );
}

export default Tree;
