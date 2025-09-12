import express from "express";

import familyTree from "./familyTree";
import person from "./person";
import family from "./family";
import auth from "./auth";
import relationship from "./relationship";

const router = express.Router();

router.use("/tree", familyTree);
router.use("/person", person);
router.use("/relationship", relationship);
router.use("/family", family);
router.use("/auth", auth);

export default router;
