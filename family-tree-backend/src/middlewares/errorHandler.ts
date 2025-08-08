import { Request, Response, NextFunction } from "express";
import logger from "@/utils/logger";

export interface CustomError extends Error {
  statusCode?: number;
  response?: {
    status: number;
    data: {
      message: string;
    };
  };
}

export function error(message: string, statusCode: number = 500) {
  const err = new Error(message) as CustomError;
  err.statusCode = statusCode;
  return err;
}

const errorHandler = async (
  err: CustomError,
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response> => {
  logger.error(err);

  if (err.response) {
    err.statusCode = err.response.status;
    err.message = err.response.data.message;
  } else if (err.message.includes("ECONNREFUSED")) {
    err.message = "Internal Server Error";
  }

  return res
    .status(err.statusCode || 500)
    .json({ message: err.message, status: err.statusCode || 500 });
};

export default errorHandler;
