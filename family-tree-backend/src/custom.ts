import { Types } from "mongoose";
import { IUser } from "./models/user";

declare global {
  namespace Express {
    interface Response {
      success: (data: any, status: number, message?: string) => this;
    }

    interface Request {
      user?: IUser & { _id: Types.ObjectId };
      token?: string;
    }
  }
}
