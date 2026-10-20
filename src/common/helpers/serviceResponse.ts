import { Response } from "express";
import { ServiceResponse } from "../types";

export function createSuccessResponse<T>(data: T): ServiceResponse<T> {
  return {
    success: true,
    response: data,
  };
}

export function sendSuccessResponse<T>(
  res: Response,
  data: T,
  statusCode: number = 200,
  message?: string
): Promise<ServiceResponse<T>> {
  const response = createSuccessResponse(data);
  res.status(statusCode).json({
    ...response,
    message,
  });
  return Promise.resolve(response);
}
