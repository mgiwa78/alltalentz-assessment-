import { z } from "zod";
import { paginationQuerySchema } from "@/common/middleware/validation";

export const listAuditLogsQuerySchema = paginationQuerySchema.extend({
  action: z.string().trim().max(100).optional(),
  resourceType: z.string().trim().max(50).optional(),
  resourceId: z.string().trim().max(100).optional(),
  userId: z.uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type ListAuditLogsQueryDTO = z.infer<typeof listAuditLogsQuerySchema>;
