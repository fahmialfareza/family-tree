import express from "express";

import { createFamily, getFamilies } from "@/controllers/family";

const router = express.Router();

router.get("/", getFamilies);
router.post("/", createFamily);

export default router;
