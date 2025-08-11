import { TTypeID } from "@/models/types/id";
import { UploadedFile } from "express-fileupload";

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

  photo?: UploadedFile;
}

export interface UpdatePersonDto extends CreatePersonDto {
  _id: TTypeID;
}
