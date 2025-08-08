import newrelic from "newrelic";
import { Request, Response } from "express";
import { findAllPeople } from "@/services/person";
import { responseSuccess } from "@/utils/response";

export async function getAllPeople(req: Request, res: Response) {
  return newrelic.startSegment(
    "controller.person.getAllPeople",
    true,
    async () => {
      const people = await findAllPeople();
      responseSuccess(res, people, 200);
    }
  );
}
