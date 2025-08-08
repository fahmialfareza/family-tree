import { Schema, model } from "mongoose";
import mongooseDelete from "mongoose-delete";

export interface IPerson {
  name: string;
  gender: "male" | "female";
  birthDate: Date;
  photoUrl?: string;
}

const personSchema = new Schema<IPerson>(
  {
    name: {
      type: String,
      required: true,
    },
    gender: {
      type: String,
      enum: ["male", "female"],
      required: true,
    },
    birthDate: {
      type: Date,
      required: true,
    },
    photoUrl: {
      type: String,
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

export default model<IPerson>("Person", personSchema);
