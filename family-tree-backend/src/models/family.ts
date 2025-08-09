import { Schema, model } from "mongoose";
import mongooseDelete, {
  SoftDeleteDocument,
  SoftDeleteModel,
} from "mongoose-delete";
import { TTypeID } from "./types/id";

export interface IFamily extends SoftDeleteDocument {
  name: string;
  person: TTypeID;
  ownedBy: TTypeID;
}

const familySchema = new Schema<IFamily>(
  {
    name: {
      type: String,
      required: true,
    },
    person: {
      type: Schema.Types.ObjectId,
      ref: "Person",
      required: true,
    },
    ownedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: { getters: true, virtuals: true },
    toObject: { virtuals: true },
  }
);

familySchema.plugin(mongooseDelete, { overrideMethods: "all" });

const familyModel = model<IFamily>(
  "Family",
  familySchema
) as SoftDeleteModel<IFamily>;
export default familyModel;
