import express from "express";

import {
  crudRelationships,
  getRelationships,
} from "@/controllers/relationship";
import { authenticate } from "@/middlewares/auth";

const router = express.Router();

router
  .route("/:id")
  .get(authenticate(["admin", "user"]), getRelationships)
  .post(authenticate(["user"]), crudRelationships);

export default router;
