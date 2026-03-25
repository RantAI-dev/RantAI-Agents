import { z } from "zod"

export const RespondApprovalSchema = z.object({
  status: z.enum(["approved", "rejected", "edited"]),
  response: z.unknown().optional(),
  responseData: z.unknown().optional(),
})

export type RespondApprovalInput = z.infer<typeof RespondApprovalSchema>
