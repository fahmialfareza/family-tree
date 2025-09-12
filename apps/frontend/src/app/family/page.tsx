import { cookies } from "next/headers";
import FamilyTable from "@/components/FamilyTable";
import { getFamilies } from "@/service/family";
import { redirect } from "next/navigation";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Family | Family Tree",
  description: "Manage your family tree",
};

async function Tree() {
  const cookieStore = await cookies();
  const tokenCookie = cookieStore.get("token");
  const token = tokenCookie ? tokenCookie.value : undefined;
  const { data, status } = await getFamilies(token);
  if (status === 401) cookieStore.delete("token");
  if (!data || status === 401) {
    redirect("/auth/login");
  }

  return (
    <div className="p-8 m-8 bg-white rounded-lg shadow">
      <FamilyTable data={data} />
    </div>
  );
}

export default Tree;
