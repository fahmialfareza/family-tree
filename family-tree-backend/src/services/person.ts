import { getAllPeople } from "@/repositories/person";

export async function findAllPeople() {
  return getAllPeople();
}
