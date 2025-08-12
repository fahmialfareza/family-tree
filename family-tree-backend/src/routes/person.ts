import express from "express";

import {
  createPerson,
  getAllPeople,
  getPersonById,
  updatePerson,
  updatePersonOwnership,
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
router.put("/:id/ownership", authenticate(["admin"]), updatePersonOwnership);

export default router;
