import { z } from "zod"

export const FilesRouteParamsSchema = z.object({
  key: z.array(z.string().min(1)).min(1),
})

export const FilesRouteQuerySchema = z
  .object({
    redirect: z.enum(["true", "false"]).optional(),
    download: z.enum(["true", "false"]).optional(),
  })
  .passthrough()
