import { Schema, Types, model } from "mongoose";
import mongooseDelete, {
  SoftDeleteDocument,
  SoftDeleteModel,
} from "mongoose-delete";
import { IRelationship } from "./relationship";

export interface IPerson extends SoftDeleteDocument {
  name: string;
  nickname: string;
  address: string;
  status: "alive" | "deceased";
  gender: "male" | "female";
  phone?: string;
  birthDate?: Date;
  photoUrl?: string;
  ownedBy?: Types.ObjectId;

  relationships?: IRelationship[];
}

const personSchema = new Schema<IPerson>(
  {
    name: {
      type: String,
      required: true,
    },
    nickname: {
      type: String,
      required: true,
    },
    address: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["alive", "deceased"],
      required: true,
    },
    gender: {
      type: String,
      enum: ["male", "female"],
      required: true,
    },
    phone: {
      type: String,
      required: false,
    },
    birthDate: {
      type: Date,
      required: false,
    },
    photoUrl: {
      type: String,
      required: false,
    },
    ownedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
  },
  {
    timestamps: true,
    toJSON: { getters: true, virtuals: true },
    toObject: { virtuals: true },
  }
);

personSchema.plugin(mongooseDelete, { overrideMethods: "all" });

personSchema.virtual("relationships", {
  ref: "Relationship",
  localField: "_id",
  foreignField: "from",
  justOne: false,
});

const personModel: SoftDeleteModel<IPerson> = model<IPerson>(
  "Person",
  personSchema
) as SoftDeleteModel<IPerson>;
export default personModel;
