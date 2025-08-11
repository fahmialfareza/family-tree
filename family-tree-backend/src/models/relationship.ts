import { model, Schema } from "mongoose";
import mongooseDelete, {
  SoftDeleteDocument,
  SoftDeleteModel,
} from "mongoose-delete";
import { TTypeID } from "./types/id";
import { IPerson } from "./person";

export interface IRelationship extends SoftDeleteDocument {
  from: TTypeID;
  to: TTypeID;
  order?: number;
  type: "parent" | "spouse" | "child";

  fromDetails?: IPerson;
  toDetails?: IPerson;
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

relationshipSchema.virtual("fromDetails", {
  ref: "Person",
  localField: "from",
  foreignField: "_id",
  justOne: true,
});
relationshipSchema.virtual("toDetails", {
  ref: "Person",
  localField: "to",
  foreignField: "_id",
  justOne: true,
});

const relationshipModel = model<IRelationship>(
  "Relationship",
  relationshipSchema
) as SoftDeleteModel<IRelationship>;
export default relationshipModel;
