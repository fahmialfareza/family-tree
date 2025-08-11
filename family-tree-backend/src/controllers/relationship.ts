import newrelic from "newrelic";
import { Request, Response } from "express";
import { Types } from "mongoose";
import z from "zod";
import { responseSuccess } from "@/utils/response";
import {
  findRelationshipByPersonId,
  upsertRelationships,
} from "@/services/relationship";
import { error } from "@/middlewares/errorHandler";

const getRelationshipsParamsSchema = z.object({
  id: z.string().refine((id) => Types.ObjectId.isValid(id), {
    message: "Invalid Person ID",
  }),
});

export async function getRelationships(req: Request, res: Response) {
  const parseParamsResult = getRelationshipsParamsSchema.safeParse(req.params);
  if (!parseParamsResult.success) {
    const firstIssue = parseParamsResult.error.issues[0];
    throw error(
      firstIssue ? firstIssue.message : "Invalid request params",
      400
    );
  }

  const relationships = await findRelationshipByPersonId(
    parseParamsResult.data.id
  );
  responseSuccess(res, relationships, 200);
}

const upsertRelationshipBodySchema = z.array(
  z.object({
    from: z.string().optional(),
    to: z.string(),
    order: z
      .string()
      .or(z.number())
      .refine((val) => {
        if (typeof val === "string") {
          return !isNaN(Number(val));
        }
        return true;
      })
      .optional(),
    type: z.enum(["parent", "spouse", "child"]),
    _id: z.string().optional(),
  })
);
const upsertRelationshipParamsSchema = z.object({
  id: z.string().refine((id) => Types.ObjectId.isValid(id), {
    message: "Invalid Person ID",
  }),
});

export async function crudRelationships(
  req: Request<
    z.infer<typeof upsertRelationshipParamsSchema>,
    {},
    z.infer<typeof upsertRelationshipBodySchema>
  >,
  res: Response
) {
  return newrelic.startSegment(
    "controller.family.createFamily",
    true,
    async () => {
      const parseBodyResult = upsertRelationshipBodySchema.safeParse(req.body);
      if (!parseBodyResult.success) {
        const firstIssue = parseBodyResult.error.issues[0];
        throw error(
          firstIssue ? firstIssue.message : "Invalid request body",
          400
        );
      }

      const parseParamsResult = upsertRelationshipParamsSchema.safeParse(
        req.params
      );
      if (!parseParamsResult.success) {
        const firstIssue = parseParamsResult.error.issues[0];
        throw error(
          firstIssue ? firstIssue.message : "Invalid request params",
          400
        );
      }

      const newFamily = await upsertRelationships(
        parseParamsResult.data.id,
        parseBodyResult.data
      );
      responseSuccess(res, newFamily, 201);
    }
  );
}
