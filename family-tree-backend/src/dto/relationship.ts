import { TTypeID } from "@/models/types/id";

export interface CreateRelationshipDto {
  from?: TTypeID;
  to: TTypeID;
  order?: number;
  type: "parent" | "spouse" | "child";
}

export interface UpdateRelationshipDto extends CreateRelationshipDto {
  _id: TTypeID;
}

export interface UpsertRelationshipDto extends CreateRelationshipDto {
  _id?: TTypeID;
}
