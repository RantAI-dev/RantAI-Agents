import { z } from "zod"

export const McpAuthorizationHeaderSchema = z.object({
  authorization: z.string().optional(),
})
