import { TTypeID } from "@/models/types/id";

export interface CreatePersonDto {
  name: string;
  nickname: string;
  address: string;
  status: "alive" | "deceased";
  gender: "male" | "female";
  birthDate: Date;
  phone?: string;
  photoUrl?: string;
  ownedBy: TTypeID;
}

export interface UpdatePersonDto extends CreatePersonDto {
  _id: TTypeID;
}
