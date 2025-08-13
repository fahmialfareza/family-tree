import PersonForm from "@/components/PersonForm";
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
    title: `Edit Person | Family Tree`,
    description: `Edit person with ${
      data?.name ?? "Unknown"
    } in the family tree`,
  };
}

export default async function EditPersonPage({
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

  return (
    <div className="p-8 m-1">
      <PersonForm
        mode="edit"
        key={id}
        initialValues={{
          ...data,
          birthDate: data?.birthDate
            ? new Date(data.birthDate).toISOString().split("T")[0]
            : "",
        }}
      />
    </div>
  );
}
