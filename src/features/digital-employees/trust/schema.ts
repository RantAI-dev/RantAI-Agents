import { z } from "zod"

export const DigitalEmployeeIdParamsSchema = z.object({
  id: z.string().min(1),
})
