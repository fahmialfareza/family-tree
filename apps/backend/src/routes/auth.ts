import express from "express";

import { createUser, profile, users } from "@/controllers/auth";
import { authenticate, signIn } from "@/middlewares/auth";

const router = express.Router();

router
  .route("/")
  .get(authenticate(["admin", "user"]), profile)
  .post(authenticate(["admin"]), createUser);
router.post("/signin", signIn, profile);
router.get("/users", authenticate(["admin"]), users);

export default router;
