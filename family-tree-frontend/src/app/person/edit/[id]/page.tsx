import PersonForm from "@/components/PersonForm";
import { getPerson } from "@/service/person";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { toast } from "react-toastify";

export default async function EditPersonPage({
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

  return (
    <PersonForm
      mode="edit"
      key={id}
      initialValues={{
        ...data,
        birthDate: new Date(data.birthDate).toISOString().split("T")[0],
      }}
    />
  );
}
