import express from "express";

import { getAllPeople } from "@/controllers/person";

const router = express.Router();

router.get("/", getAllPeople);

export default router;
