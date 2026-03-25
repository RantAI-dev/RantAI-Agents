import { z } from "zod"

export const CronAuthHeaderSchema = z.object({
  authorization: z.string().optional(),
})
