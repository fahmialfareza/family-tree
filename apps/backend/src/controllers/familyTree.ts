import newrelic from "newrelic";
import { Request, Response } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import { error } from "@/middlewares/errorHandler";
import { buildFamilyTree } from "@/services/treeBuilder";
import { responseSuccess } from "@/utils/response";
import { transformToCoupleTree } from "@/utils/transformation";

const getFamilyTreeParamsSchema = z.object({
  personId: z
    .string()
    .min(1, "Person ID is required")
    .refine((id) => Types.ObjectId.isValid(id), {
      message: "Invalid Person ID",
    }),
});
const getFamilyTreeQuerySchema = z.object({
  mode: z.enum(["parent", "child"]).default("parent"),
});

export async function getFamilyTree(
  req: Request<
    z.infer<typeof getFamilyTreeParamsSchema>,
    {},
    {},
    z.infer<typeof getFamilyTreeQuerySchema>
  >,
  res: Response
) {
  return newrelic.startSegment(
    "controller.familyTree.getFamilyTree",
    true,
    async () => {
      const parseParamsResult = getFamilyTreeParamsSchema.safeParse(req.params);
      if (!parseParamsResult.success) {
        const firstIssue = parseParamsResult.error.issues[0];
        throw error(
          firstIssue ? firstIssue.message : "Invalid parameters",
          400
        );
      }
      const { personId } = parseParamsResult.data;

      const parseQueryResult = getFamilyTreeQuerySchema.safeParse(req.query);
      if (!parseQueryResult.success) {
        const firstIssue = parseQueryResult.error.issues[0];
        throw error(
          firstIssue ? firstIssue.message : "Invalid query parameters",
          400
        );
      }
      const { mode } = parseQueryResult.data;

      const familyTree = await buildFamilyTree(
        personId,
        mode === "parent",
        mode === "child"
      );
      const result = transformToCoupleTree(familyTree);

      responseSuccess(res, result, 200);
    }
  );
}
