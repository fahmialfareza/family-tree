import newrelic from "newrelic";
import { Request, Response } from "express";
import { z } from "zod";
import { responseSuccess } from "@/utils/response";
import { getAllFamilies, addFamily } from "@/services/family";
import { error } from "@/middlewares/errorHandler";

export async function getFamilies(req: Request, res: Response) {
  return newrelic.startSegment(
    "controller.family.getFamilies",
    true,
    async () => {
      const families = await getAllFamilies();
      responseSuccess(res, families, 200);
    }
  );
}

const createFamilyBodySchema = z.object({
  name: z.string().min(1, "Family Name is required"),
  person: z.string().min(1, "Person is required"),
});

export async function createFamily(req: Request, res: Response) {
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
      const { person, name } = parseResult.data;

      const newFamily = await addFamily(name, person);
      responseSuccess(res, newFamily, 201);
    }
  );
}
