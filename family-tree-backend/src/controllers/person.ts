import newrelic from "newrelic";
import { Request, Response } from "express";
import { z } from "zod";
import {
  findAllPeople,
  findPersonById,
  addPerson,
  editPerson,
  removePersonById,
} from "@/services/person";
import { responseSuccess } from "@/utils/response";
import { error } from "@/middlewares/errorHandler";
import { Types } from "mongoose";
import { UploadedFile } from "express-fileupload";

export async function getAllPeople(req: Request, res: Response) {
  return newrelic.startSegment(
    "controller.person.getAllPeople",
    true,
    async () => {
      if (req.user?.role === "admin") {
        const allPeople = await findAllPeople();
        responseSuccess(res, allPeople, 200);
        return;
      }

      const people = await findAllPeople(req.user!._id!);
      responseSuccess(res, people, 200);
    }
  );
}

const getPersonByIdSchema = z.object({
  id: z
    .string()
    .min(1, "ID is required")
    .refine((id) => Types.ObjectId.isValid(id), {
      message: "Invalid ID",
    }),
});

export async function getPersonById(
  req: Request<z.infer<typeof getPersonByIdSchema>>,
  res: Response
) {
  const { id } = req.params;
  const person = await findPersonById(id);
  if (!person) {
    throw error("Person not found", 404);
  }

  responseSuccess(res, person, 200);
}

const createPersonBodySchema = z.object({
  name: z.string().min(1, "Name is required"),
  nickname: z.string().min(1, "Nickname is required"),
  address: z.string().min(1, "Address is required"),
  status: z.enum(["alive", "deceased"], {
    message: "Status is required",
  }),
  gender: z.enum(["male", "female"], {
    message: "Gender is required",
  }),
  birthDate: z
    .string()
    .refine((date) => !isNaN(new Date(date).getTime()), {
      message: "Invalid birth date",
    })
    .transform((date) => new Date(date))
    .optional(),
  phone: z.string().optional(),
});

const createPersonFileSchema = z
  .object({
    photo: z
      .any()
      .refine(
        (file: UploadedFile | UploadedFile[]) =>
          file === undefined ||
          (Array.isArray(file) &&
            file.length > 0 &&
            file[0] &&
            typeof file[0].size === "number" &&
            file[0].size <= 1024 * 1024) ||
          (!Array.isArray(file) &&
            typeof file.size === "number" &&
            file.size <= 1024 * 1024),
        {
          message: "Photo must not exceed 1 MB",
        }
      )
      .transform((file: UploadedFile | UploadedFile[]) =>
        Array.isArray(file)
          ? file[0]
          : file && typeof file === "object"
            ? file
            : undefined
      )
      .optional(),
  })
  .nullable();

export async function createPerson(
  req: Request<{}, {}, z.infer<typeof createPersonBodySchema>>,
  res: Response
) {
  return newrelic.startSegment(
    "controller.person.createPerson",
    true,
    async () => {
      const parseResult = createPersonBodySchema.safeParse(req.body);
      if (!parseResult.success) {
        const firstIssue = parseResult.error.issues[0];
        throw error(
          firstIssue ? firstIssue.message : "Invalid request body",
          400
        );
      }

      const parseFileResult = createPersonFileSchema.safeParse(req.files);
      if (!parseFileResult.success) {
        const firstIssue = parseFileResult.error.issues[0];
        throw error(
          firstIssue ? firstIssue.message : "Invalid file upload",
          400
        );
      }

      const newPerson = await addPerson({
        ...parseResult.data,
        ownedBy: req.user!._id!,
        photo: parseFileResult?.data?.photo,
      });
      responseSuccess(res, newPerson);
    }
  );
}

const updatePersonParamsSchema = z.object({
  id: z
    .string()
    .min(1, "ID is required")
    .refine((id) => Types.ObjectId.isValid(id), {
      message: "Invalid ID",
    }),
});

const updatePersonBodySchema = z.object({
  name: z.string().min(1, "Name is required"),
  nickname: z.string().min(1, "Nickname is required"),
  address: z.string().min(1, "Address is required"),
  status: z.enum(["alive", "deceased"], {
    message: "Status is required",
  }),
  gender: z.enum(["male", "female"], {
    message: "Gender is required",
  }),
  birthDate: z
    .string()
    .refine((date) => !isNaN(new Date(date).getTime()), {
      message: "Invalid birth date",
    })
    .transform((date) => new Date(date))
    .optional(),
  phone: z.string().optional(),
});

const updatePersonFileSchema = z
  .object({
    photo: z
      .any()
      .refine(
        (file: UploadedFile | UploadedFile[]) =>
          file === undefined ||
          (Array.isArray(file) &&
            file.length > 0 &&
            file[0] &&
            typeof file[0].size === "number" &&
            file[0].size <= 1024 * 1024) ||
          (!Array.isArray(file) &&
            typeof file.size === "number" &&
            file.size <= 1024 * 1024),
        {
          message: "Photo must not exceed 1 MB",
        }
      )
      .transform((file: UploadedFile | UploadedFile[]) =>
        Array.isArray(file)
          ? file[0]
          : file && typeof file === "object"
            ? file
            : undefined
      )
      .optional(),
  })
  .nullable();

export async function updatePerson(
  req: Request<
    z.infer<typeof updatePersonParamsSchema>,
    {},
    z.infer<typeof updatePersonBodySchema>
  >,
  res: Response
) {
  return newrelic.startSegment(
    "controller.person.updatePerson",
    true,
    async () => {
      const parseBodyResult = updatePersonBodySchema.safeParse(req.body);
      if (!parseBodyResult.success) {
        const firstIssue = parseBodyResult.error.issues[0];
        throw error(
          firstIssue ? firstIssue.message : "Invalid request body",
          400
        );
      }

      const parseParamsResult = updatePersonParamsSchema.safeParse(req.params);
      if (!parseParamsResult.success) {
        const firstIssue = parseParamsResult.error.issues[0];
        throw error(
          firstIssue ? firstIssue.message : "Invalid request parameters",
          400
        );
      }

      const parseFileResult = updatePersonFileSchema.safeParse(req.files);
      if (!parseFileResult.success) {
        const firstIssue = parseFileResult.error.issues[0];
        throw error(
          firstIssue ? firstIssue.message : "Invalid file upload",
          400
        );
      }

      const newPerson = await editPerson({
        ...parseBodyResult.data,
        _id: parseParamsResult.data.id,
        ownedBy: req.user!._id!,
        photo: parseFileResult?.data?.photo,
      });
      responseSuccess(res, newPerson);
    }
  );
}

const deletePersonByIdSchema = z.object({
  id: z
    .string()
    .min(1, "ID is required")
    .refine((id) => Types.ObjectId.isValid(id), {
      message: "Invalid ID",
    }),
});

export async function deletePersonById(
  req: Request<z.infer<typeof deletePersonByIdSchema>>,
  res: Response
) {
  const { id } = req.params;
  const deletedPerson = await removePersonById(id);
  if (!deletedPerson) {
    throw error("Person not found", 404);
  }

  responseSuccess(res, deletedPerson, 200);
}
