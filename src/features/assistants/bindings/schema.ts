import { z } from "zod"

export const AssistantIdParamsSchema = z.object({
  id: z.string().min(1),
})

export const AssistantToolIdsSchema = z.object({
  toolIds: z.array(z.string().min(1)),
})

export const AssistantSkillIdsSchema = z.object({
  skillIds: z.array(z.string()),
})

export const AssistantMcpServerIdsSchema = z.object({
  mcpServerIds: z.array(z.string().min(1)),
})

export const AssistantWorkflowIdsSchema = z.object({
  workflowIds: z.array(z.string().min(1)),
})
