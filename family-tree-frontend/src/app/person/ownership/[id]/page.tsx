import OwnershipForm from "@/components/OwnershipForm";
import { getUsers } from "@/service/auth";
import { getPerson } from "@/service/person";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { toast } from "react-toastify";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const tokenCookie = cookieStore.get("token");
  const token = tokenCookie ? tokenCookie.value : undefined;
  const { data, message, status } = await getPerson(id, token);
  if (status === 401) cookieStore.delete("token");
  if (!data || status === 401) {
    toast.error(message);
    redirect("/auth/login");
  }

  return {
    title: `Edit Ownership | Family Tree`,
    description: `Edit Ownership with ${
      data?.name ?? "Unknown"
    } in the family tree`,
  };
}

export default async function OwnershipPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const tokenCookie = cookieStore.get("token");
  const token = tokenCookie ? tokenCookie.value : undefined;
  const [usersData, personData] = await Promise.all([
    getUsers(token),
    getPerson(id, token),
  ]);
  if (usersData.status === 401 || personData.status === 401) {
    cookieStore.delete("token");
  }
  if (!usersData.data || usersData.status === 401) {
    toast.error(usersData.message);
    redirect("/auth/login");
  }
  if (!personData.data || personData.status === 401) {
    toast.error(personData.message);
    redirect("/auth/login");
  }

  return (
    <div className="p-8 m-1">
      {" "}
      <OwnershipForm
        id={id}
        initialUsers={usersData.data}
        initialOwners={personData.data?.owners || []}
      />
    </div>
  );
}
