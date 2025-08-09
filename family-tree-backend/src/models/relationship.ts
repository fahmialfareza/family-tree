import { model, Schema } from "mongoose";
import mongooseDelete, {
  SoftDeleteDocument,
  SoftDeleteModel,
} from "mongoose-delete";
import { TTypeID } from "./types/id";

export interface IRelationship extends SoftDeleteDocument {
  from: TTypeID;
  to: TTypeID;
  order?: number;
  type: "parent" | "spouse" | "child";
}

const relationshipSchema = new Schema<IRelationship>(
  {
    from: {
      type: Schema.Types.ObjectId,
      ref: "Person",
      required: true,
    },
    to: {
      type: Schema.Types.ObjectId,
      ref: "Person",
      required: true,
    },
    order: {
      type: Number,
      required: false,
    },
    type: {
      type: String,
      enum: ["parent", "spouse", "child"],
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: { getters: true, virtuals: true },
    toObject: { virtuals: true },
  }
);

relationshipSchema.plugin(mongooseDelete, { overrideMethods: "all" });

const relationshipModel = model<IRelationship>(
  "Relationship",
  relationshipSchema
) as SoftDeleteModel<IRelationship>;
export default relationshipModel;
