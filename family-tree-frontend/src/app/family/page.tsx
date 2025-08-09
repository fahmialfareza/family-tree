import { cookies } from "next/headers";
import { toast } from "react-toastify";
import FamilyTable from "@/components/FamilyTable";
import { getFamilies } from "@/service/family";
import { redirect } from "next/navigation";

async function Tree() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  const { data, message } = await getFamilies(token);
  if (!data) {
    toast.error(message);
    redirect("/auth/login");
  }

  return (
    <div className="p-8 m-8 bg-white rounded-lg shadow">
      <FamilyTable data={data} />
    </div>
  );
}

export default Tree;
