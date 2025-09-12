import { model, Schema } from "mongoose";
import bcrypt from "bcrypt";
import mongooseDelete, {
  SoftDeleteDocument,
  SoftDeleteModel,
} from "mongoose-delete";

export interface IUser extends SoftDeleteDocument {
  name: string;
  username: string;
  password?: string;
  role: "admin" | "user";
}

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
      set: (v: string) => {
        const salt = bcrypt.genSaltSync(10);
        return bcrypt.hashSync(v, salt);
      },
    },
    role: {
      type: String,
      enum: ["admin", "user"],
      required: true,
      default: "user",
    },
  },
  {
    timestamps: true,
    toJSON: { getters: true, virtuals: true },
    toObject: { virtuals: true },
  }
);

userSchema.plugin(mongooseDelete, { overrideMethods: "all" });

const userModel = model<IUser>("User", userSchema) as SoftDeleteModel<IUser>;
export default userModel;
