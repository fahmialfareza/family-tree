import bcrypt from "bcrypt";
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { error } from "./errorHandler";
import { findUserById, findUserByUsername } from "@/repositories/user";

export const signIn = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { username, password } = req.body;

  if (!username || !password) {
    throw error("Missing username or password", 400);
  }

  const user = await findUserByUsername(username);
  if (!user) {
    throw error("Invalid username or password", 401);
  }

  const isMatch = await bcrypt.compare(password, user.password || "");
  if (!isMatch) {
    throw error("Invalid username or password", 401);
  }

  const token = jwt.sign(
    { id: user._id },
    process.env.JWT_SECRET || "family-tree-secret",
    {
      expiresIn: "30d",
    }
  );

  req.user = user;
  req.token = token;

  next();
};

export const authenticate =
  (roles: ("admin" | "user")[]) =>
  async (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers["authorization"]?.split(" ")[1];
    if (!token) {
      throw error("No token provided", 401);
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "family-tree-secret"
    );
    if (!decoded || typeof decoded !== "object" || !("id" in decoded)) {
      throw error("Invalid token", 401);
    }

    const user = await findUserById((decoded as jwt.JwtPayload).id);
    if (!user) {
      throw error("User not found", 401);
    }
    if (!roles.includes(user.role)) {
      throw error("Forbidden", 403);
    }

    req.user = user;
    next();
  };
