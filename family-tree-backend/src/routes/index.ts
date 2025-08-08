import express from "express";

import familyTree from "./familyTree";
import person from "./person";
import family from "./family";

const router = express.Router();

router.use("/tree", familyTree);
router.use("/person", person);
router.use("/family", family);

export default router;
