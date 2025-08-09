import express from "express";

import { createUser, profile } from "@/controllers/auth";
import { authenticate, signIn } from "@/middlewares/auth";

const router = express.Router();

router
  .route("/")
  .get(authenticate(["admin", "user"]), profile)
  .post(authenticate(["admin"]), createUser);
router.post("/signin", signIn, profile);

export default router;
