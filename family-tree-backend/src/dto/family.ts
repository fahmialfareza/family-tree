import { TTypeID } from "@/models/types/id";

export interface CreateFamilyDto {
  name: string;
  person: TTypeID;
  ownedBy: TTypeID;
}
