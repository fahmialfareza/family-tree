import { NextFunction, Request, Response } from "express";
import newrelic from "newrelic";
import { z } from "zod";
import { addUser, getUsers } from "@/services/user";
import { error } from "@/middlewares/errorHandler";
import { responseSuccess } from "@/utils/response";

const createUserBodySchema = z.object({
  name: z.string().min(2).max(100),
  username: z.string().min(2).max(100),
  password: z.string().min(6).max(100),
});

export const createUser = async (
  req: Request<{}, {}, z.infer<typeof createUserBodySchema>>,
  res: Response,
  next: NextFunction
) => {
  return newrelic.startSegment("controller.user.createUser", true, async () => {
    const parseResult = createUserBodySchema.safeParse(req.body);
    if (!parseResult.success) {
      const firstIssue = parseResult.error.issues[0];
      throw error(
        firstIssue ? firstIssue.message : "Invalid request body",
        400
      );
    }

    const newUser = await addUser({ ...parseResult.data, role: "user" });
    if (newUser && "password" in newUser) {
      delete newUser.password;
    }

    responseSuccess(res, newUser, 201);
  });
};

export const profile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  return newrelic.startSegment("controller.user.profile", true, async () => {
    const { user, token } = req;
    if (user && "password" in user) {
      delete user.password;
    }

    responseSuccess(res, { user, token }, 200);
  });
};

export const users = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  return newrelic.startSegment("controller.user.users", true, async () => {
    const { user } = req;
    if (user && user.role !== "admin") {
      throw error("Unauthorized", 403);
    }

    const users = await getUsers({ role: "user" });
    responseSuccess(res, users, 200);
  });
};
