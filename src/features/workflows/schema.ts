import { z } from "zod"

export const WorkflowIdParamsSchema = z.object({
  id: z.string().min(1),
})

export const WorkflowRunIdParamsSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
})

export const WorkflowListQuerySchema = z
  .object({
    assistantId: z.string().optional(),
  })
  .passthrough()

export const CreateWorkflowSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    assistantId: z.string().optional(),
    tags: z.unknown().optional(),
    category: z.string().optional(),
  })
  .passthrough()

export const UpdateWorkflowSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    nodes: z.unknown().optional(),
    edges: z.unknown().optional(),
    trigger: z.unknown().optional(),
    variables: z.unknown().optional(),
    status: z.string().optional(),
    mode: z.string().optional(),
    category: z.string().optional(),
    chatflowConfig: z.unknown().optional(),
    apiEnabled: z.boolean().optional(),
    assistantId: z.string().optional(),
    tags: z.unknown().optional(),
  })
  .passthrough()

export const WorkflowImportSchema = z.unknown()

export const WorkflowExecuteSchema = z
  .object({
    input: z.unknown().optional(),
    threadId: z.string().optional(),
  })
  .passthrough()

export const WorkflowResumeSchema = z
  .object({
    stepId: z.string().optional(),
    data: z.unknown().optional(),
  })
  .passthrough()
