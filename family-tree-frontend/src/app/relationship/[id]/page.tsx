import RelationshipForm from "@/components/RelationshipForm";
import { getPeople } from "@/service/person";
import { getRelationships, upsertRelationships } from "@/service/relationship";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { toast } from "react-toastify";

export default async function RelationshipPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  const [relationshipsData, peopleData] = await Promise.all([
    getRelationships(id, token),
    getPeople(token),
  ]);
  if (!relationshipsData.data) {
    toast.error(relationshipsData.message);
    redirect("/auth/login");
  }

  if (!peopleData.data) {
    toast.error(peopleData.message);
    redirect("/auth/login");
  }

  return (
    <div className="p-8 m-1">
      {" "}
      <RelationshipForm
        id={id}
        initialRelationships={relationshipsData.data}
        initialPeople={peopleData.data}
      />
    </div>
  );
}
