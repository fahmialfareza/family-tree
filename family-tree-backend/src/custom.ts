import { ObjectId } from "mongoose";

type TUser = {
  id: ObjectId;
  email: string;
  role: string;
};

declare global {
  namespace Express {
    interface Response {
      success: (data: any, status: number, message?: string) => this;
    }

    interface Request {
      user?: TUser;
    }
  }
}
