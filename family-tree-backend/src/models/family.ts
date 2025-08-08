import { Schema, model } from "mongoose";
import mongooseDelete from "mongoose-delete";
import { TTypeID } from "./types/id";

export interface IFamily {
  name: string;
  person: TTypeID;
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
  },
  {
    timestamps: true,
    toJSON: { getters: true, virtuals: true },
    toObject: { virtuals: true },
  }
);

familySchema.plugin(mongooseDelete, { overrideMethods: "all" });

export default model<IFamily>("Family", familySchema);
