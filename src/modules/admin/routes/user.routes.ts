import { Router } from "express";
import { DataSource } from "typeorm";
import { RedisClient } from "@/common";
import { validate } from "@/common/middleware/validation";
import { AdminUserController } from "../controllers/user.controller";
import { createUserSchema, listUsersQuerySchema, updateUserSchema } from "../validation/user.validation";

export const createAdminUserRoutes = (dataSource: DataSource, redis: RedisClient) => {
  const router = Router();
  const controller = new AdminUserController(dataSource, redis);

  router.get("/users", validate(listUsersQuerySchema), controller.list);
  router.post("/users", validate(createUserSchema), controller.create);
  router.patch("/users/:userId", validate(updateUserSchema), controller.update);

  return router;
};
