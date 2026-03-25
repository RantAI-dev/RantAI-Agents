import { z } from "zod"

export const DigitalEmployeeIdParamsSchema = z.object({
  id: z.string().min(1),
})

export const WorkspaceExecBodySchema = z
  .object({
    command: z.any(),
    cwd: z.any().optional(),
  })
  .passthrough()

export const WorkspaceFilePathQuerySchema = z
  .object({
    path: z.any().optional(),
    recursive: z.any().optional(),
  })
  .passthrough()

export const WorkspaceFileWriteBodySchema = z
  .object({
    path: z.any(),
    content: z.any(),
  })
  .passthrough()

export type WorkspaceExecInput = z.infer<typeof WorkspaceExecBodySchema>
export type WorkspaceFileWriteInput = z.infer<typeof WorkspaceFileWriteBodySchema>
