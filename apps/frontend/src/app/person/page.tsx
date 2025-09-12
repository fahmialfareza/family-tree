import { cookies } from "next/headers";
import PersonTable from "@/components/PersonTable";
import { getPeople } from "@/service/person";
import { redirect } from "next/navigation";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "People | Family Tree",
  description:
    "Manage your family tree by adding, editing, and viewing people.",
};

async function Tree() {
  const cookieStore = await cookies();
  const tokenCookie = cookieStore.get("token");
  const token = tokenCookie ? tokenCookie.value : undefined;
  const { data, status } = await getPeople(token);
  if (status === 401) cookieStore.delete("token");
  if (!data || status === 401) {
    redirect("/auth/login");
  }

  return (
    <div className="p-8 m-8 bg-white rounded-lg shadow">
      <PersonTable data={data} />
    </div>
  );
}

export default Tree;
