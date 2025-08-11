import PersonForm from "@/components/PersonForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create Person | Family Tree",
  description: "Create a new person in the family tree",
};

export default function CreatePersonPage() {
  return (
    <div className="p-8 m-1">
      <PersonForm mode="create" />
    </div>
  );
}
1;
