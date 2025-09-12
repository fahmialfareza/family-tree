import { cookies } from "next/headers";
import ClientTreeWrapper from "@/components/ClientTreeWrapper";
import { getFamilyTreeData } from "@/service/tree";
import { redirect } from "next/navigation";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode: "parent" | "child" }>;
}) {
  const { id } = await params;
  const { mode } = await searchParams;
  const cookieStore = await cookies();
  const tokenCookie = cookieStore.get("token");
  const token = tokenCookie ? tokenCookie.value : undefined;
  const { data, status } = await getFamilyTreeData(id, mode, token);
  if (status === 401) cookieStore.delete("token");
  if (!data || status === 401) {
    redirect("/auth/login");
  }

  return {
    title: `${Array.isArray(data) ? data[0]?.name : data.name} | Family Tree`,
    description: `View the family tree of ${data.name}.`,
  };
}

export default async function TreePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode: "parent" | "child" }>;
}) {
  const { id } = await params;
  const { mode } = await searchParams;

  const cookieStore = await cookies();
  const tokenCookie = cookieStore.get("token");
  const token = tokenCookie ? tokenCookie.value : undefined;
  const { data, status } = await getFamilyTreeData(id, mode, token);
  if (status === 401) cookieStore.delete("token");
  if (!data || status === 401) {
    redirect("/auth/login");
  }

  return (
    <main className="flex flex-col items-center py-12">
      <section className="w-full bg-white/80 rounded-3xl shadow-2xl p-10 flex flex-col items-center gap-6 animate-fade-in">
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-5xl font-extrabold text-indigo-700 drop-shadow-lg tracking-tight flex items-center gap-2">
            <span role="img" aria-label="tree">
              🌳
            </span>
            Family Tree
          </h1>
          <p className="text-xl text-gray-700 text-center max-w-2xl">
            Explore your family connections and heritage.
          </p>
        </div>
        <div className="w-full">
          <ClientTreeWrapper data={data} />
        </div>
      </section>
    </main>
  );
}
