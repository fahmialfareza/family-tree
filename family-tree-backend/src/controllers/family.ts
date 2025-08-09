import newrelic from "newrelic";
import { Request, Response } from "express";
import { z } from "zod";
import { responseSuccess } from "@/utils/response";
import { getAllFamilies, addFamily, removeFamily } from "@/services/family";
import { error } from "@/middlewares/errorHandler";
import { Types } from "mongoose";

export async function getFamilies(req: Request, res: Response) {
  return newrelic.startSegment(
    "controller.family.getFamilies",
    true,
    async () => {
      if (req.user?.role === "user") {
        const families = await getAllFamilies(req.user!._id!);
        responseSuccess(res, families, 200);
        return;
      }

      const families = await getAllFamilies();
      responseSuccess(res, families, 200);
    }
  );
}

const createFamilyBodySchema = z.object({
  name: z.string().min(1, "Family Name is required"),
  person: z.string().min(1, "Person is required"),
});

export async function createFamily(
  req: Request<{}, {}, z.infer<typeof createFamilyBodySchema>>,
  res: Response
) {
  return newrelic.startSegment(
    "controller.family.createFamily",
    true,
    async () => {
      const parseResult = createFamilyBodySchema.safeParse(req.body);
      if (!parseResult.success) {
        const firstIssue = parseResult.error.issues[0];
        throw error(
          firstIssue ? firstIssue.message : "Invalid request body",
          400
        );
      }

      const newFamily = await addFamily({
        ...parseResult.data,
        ownedBy: req.user!._id!,
      });
      responseSuccess(res, newFamily, 201);
    }
  );
}

const deleteFamilyParamsSchema = z.object({
  id: z
    .string()
    .min(1, "Family ID is required")
    .refine((id) => Types.ObjectId.isValid(id), {
      message: "Invalid Family ID",
    }),
});

export async function deleteFamily(
  req: Request<z.infer<typeof deleteFamilyParamsSchema>>,
  res: Response
) {
  return newrelic.startSegment(
    "controller.family.deleteFamily",
    true,
    async () => {
      const parseResult = deleteFamilyParamsSchema.safeParse(req.params);
      if (!parseResult.success) {
        const firstIssue = parseResult.error.issues[0];
        throw error(
          firstIssue ? firstIssue.message : "Invalid request params",
          400
        );
      }

      const deletedFamily = await removeFamily(parseResult.data.id);
      responseSuccess(res, deletedFamily, 200);
    }
  );
}
