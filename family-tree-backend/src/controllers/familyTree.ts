import newrelic from "newrelic";
import { Request, Response } from "express";
import { z } from "zod";
import { error } from "@/middlewares/errorHandler";
import { IPerson } from "@/models/person";
import { IRelationship } from "@/models/relationship";
import {
  buildFamilyTree,
  addPersonWithRelations,
} from "@/services/treeBuilder";
import { responseSuccess } from "@/utils/response";

const getFamilyTreeParamsSchema = z.object({
  personId: z.string().min(1, "Person ID is required"),
});
const getFamilyTreeQuerySchema = z.object({
  mode: z.enum(["parent", "child"]).default("parent"),
});

export async function getFamilyTree(
  req: Request<
    { personId: string },
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
      responseSuccess(res, familyTree, 200);
    }
  );
}

const addPersonBodySchema = z.object({
  person: z.object({
    name: z.string().min(1, "Name is required"),
    gender: z.enum(["male", "female"], {
      message: "Gender is required",
    }),
    birthDate: z
      .string()
      .refine((date) => !isNaN(new Date(date).getTime()), {
        message: "Invalid birth date",
      })
      .transform((date) => new Date(date)),
    photoUrl: z.url("Invalid photo URL").optional(),
  }),
  relationships: z.array(
    z.object({
      to: z.string().min(1, "To person ID is required"),
      type: z.enum(["parent", "child", "spouse"], {
        message: "Invalid relationship type",
      }),
      order: z.number().min(1, "Order must be a positive number"),
    })
  ),
});

export async function addPerson(
  req: Request<{}, {}, { person: IPerson; relationships: IRelationship[] }>,
  res: Response
) {
  return newrelic.startSegment(
    "controller.familyTree.getFamilyTree",
    true,
    async () => {
      const parseResult = addPersonBodySchema.safeParse(req.body);
      if (!parseResult.success) {
        const firstIssue = parseResult.error.issues[0];
        throw error(
          firstIssue ? firstIssue.message : "Invalid request body",
          400
        );
      }
      const { person, relationships } = parseResult.data;

      const newPerson = await addPersonWithRelations(person, relationships);
      responseSuccess(res, newPerson);
    }
  );
}
