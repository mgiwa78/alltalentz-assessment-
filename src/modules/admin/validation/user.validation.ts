import { z } from "zod";
import { paginationQuerySchema } from "@/common/middleware/validation";
import { UserRole } from "@/database/enums/trs.enums";

export const userIdParamSchema = z.object({
  userId: z.uuid("Invalid user id"),
});

export const listUsersQuerySchema = paginationQuerySchema.extend({
  role: z.enum(UserRole).optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});

export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().max(320).pipe(z.email("Invalid email address")),
  fullName: z.string().trim().min(1, "fullName is required").max(120),
  password: z.string().min(10, "Password must be at least 10 characters").max(200),
  role: z.enum(UserRole),
});

export const updateUserSchema = userIdParamSchema
  .extend({
    fullName: z.string().trim().min(1).max(120).optional(),
    role: z.enum(UserRole).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => v.fullName !== undefined || v.role !== undefined || v.isActive !== undefined, {
    message: "Provide at least one of fullName, role or isActive",
  });

export type ListUsersQueryDTO = z.infer<typeof listUsersQuerySchema>;
export type CreateUserDTO = z.infer<typeof createUserSchema>;
export type UpdateUserDTO = z.infer<typeof updateUserSchema>;
