import RelationshipForm from "@/components/RelationshipForm";
import { getPeople } from "@/service/person";
import { getRelationships } from "@/service/relationship";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const tokenCookie = cookieStore.get("token");
  const token = tokenCookie ? tokenCookie.value : undefined;
  const { data, status } = await getRelationships(id, token);
  if (status === 401) cookieStore.delete("token");
  if (!data || status === 401) {
    redirect("/auth/login");
  }

  return {
    title: `Edit Relationship | Family Tree`,
    description: `Edit relationship with ${
      data?.name ?? "Unknown"
    } in the family tree`,
  };
}

export default async function RelationshipPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const tokenCookie = cookieStore.get("token");
  const token = tokenCookie ? tokenCookie.value : undefined;
  const [relationshipsData, peopleData] = await Promise.all([
    getRelationships(id, token),
    getPeople(token),
  ]);
  if (relationshipsData.status === 401) cookieStore.delete("token");
  if (!relationshipsData.data || relationshipsData.status === 401) {
    redirect("/auth/login");
  }

  if (peopleData.status === 401) cookieStore.delete("token");
  if (!peopleData.data || peopleData.status === 401) {
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
