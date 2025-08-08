import express from "express";

import { addPerson, getFamilyTree } from "@/controllers/familyTree";

const router = express.Router();

router.get("/:personId", getFamilyTree);
router.post("/", addPerson);

export default router;
