import express from "express";

import { getFamilyTree } from "@/controllers/familyTree";
import { authenticate } from "@/middlewares/auth";

const router = express.Router();

router.get("/:personId", authenticate(["user", "admin"]), getFamilyTree);

export default router;
