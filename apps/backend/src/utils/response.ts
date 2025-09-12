import { Response } from "express";

export const responseSuccess = (
  res: Response,
  data: any,
  statusCode: number = 200
) => {
  return res.status(statusCode).json({
    status: statusCode,
    data,
  });
};
