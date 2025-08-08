import ClientTreeWrapper from "@/components/ClientTreeWrapper";
import { SearchParams } from "next/dist/server/request/search-params";

export default async function TreePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { mode: "parent" | "child" };
}) {
  const { id } = params;
  const { mode } = searchParams;
  const data = await fetchFamilyTreeData(id, mode);

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

async function fetchFamilyTreeData(id: string, mode: "parent" | "child") {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    throw new Error("NEXT_PUBLIC_API_URL environment variable is not set");
  }

  let res: Response;
  try {
    res = await fetch(`${apiUrl}/api/tree/${id}?mode=${mode}`, {
      cache: "no-store",
    });
  } catch (error) {
    throw new Error(
      "Failed to fetch family tree data: " + (error as Error).message
    );
  }

  if (!res.ok) throw new Error("Failed to fetch family tree data");
  const { data } = await res.json();
  return data;
}
