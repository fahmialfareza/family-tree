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
  const token = cookieStore.get("token")?.value;
  const { data, message } = await getPerson(id, token);
  if (!data) {
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
  const token = cookieStore.get("token")?.value;
  const [usersData, personData] = await Promise.all([
    getUsers(token),
    getPerson(id, token),
  ]);
  if (!usersData.data) {
    toast.error(usersData.message);
    redirect("/auth/login");
  }
  if (!personData.data) {
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
