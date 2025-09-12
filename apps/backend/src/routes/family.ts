import express from "express";

import { createFamily, deleteFamily, getFamilies } from "@/controllers/family";
import { authenticate } from "@/middlewares/auth";

const router = express.Router();

router
  .route("/")
  .get(authenticate(["admin", "user"]), getFamilies)
  .post(authenticate(["user"]), createFamily);
router.route("/:id").delete(authenticate(["user"]), deleteFamily);

export default router;
