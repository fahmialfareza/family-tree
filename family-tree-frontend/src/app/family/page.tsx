import FamilyTable from "@/components/FamilyTable";
import React from "react";

async function Tree() {
  const data = await getTableData();

  return (
    <div className="p-8 m-8 bg-white rounded-lg shadow">
      <FamilyTable data={data} />
    </div>
  );
}

const getTableData = async () => {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/family`);
  const { data } = await res.json();
  return data;
};

export default Tree;
