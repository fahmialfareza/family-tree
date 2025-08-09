import express from "express";

import {
  createPerson,
  getAllPeople,
  getPersonById,
  updatePerson,
  deletePersonById,
} from "@/controllers/person";
import { authenticate } from "@/middlewares/auth";

const router = express.Router();

router
  .route("/")
  .get(authenticate(["admin", "user"]), getAllPeople)
  .post(authenticate(["user"]), createPerson);
router
  .route("/:id")
  .get(authenticate(["admin", "user"]), getPersonById)
  .put(authenticate(["user"]), updatePerson)
  .delete(authenticate(["user"]), deletePersonById);

export default router;
