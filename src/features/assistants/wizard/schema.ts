import { z } from "zod"

export const WizardMessageSchema = z.object({
  id: z.string().max(64),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().max(4000),
})

export type WizardMessage = z.infer<typeof WizardMessageSchema>

export const WizardDraftSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  emoji: z.string().optional(),
  tags: z.array(z.string()).optional(),
  systemPrompt: z.string().optional(),
  model: z.string().optional(),
  openingMessage: z.string().optional(),
  openingQuestions: z.array(z.string()).optional(),
  liveChatEnabled: z.boolean().optional(),
  selectedToolIds: z.array(z.string()).default([]),
  selectedSkillIds: z.array(z.string()).default([]),
  selectedMcpServerIds: z.array(z.string()).default([]),
  selectedWorkflowIds: z.array(z.string()).default([]),
  useKnowledgeBase: z.boolean().optional(),
  knowledgeBaseGroupIds: z.array(z.string()).default([]),
  memoryConfig: z.record(z.unknown()).optional(),
  modelConfig: z.record(z.unknown()).optional(),
  chatConfig: z.record(z.unknown()).optional(),
  guardRails: z.record(z.unknown()).optional(),
})

export type WizardDraft = z.infer<typeof WizardDraftSchema>

export const UncertaintySchema = z.record(
  z.enum(["locked", "ai-suggested", "empty"])
)

export type Uncertainty = z.infer<typeof UncertaintySchema>

export const ProposeAgentInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  emoji: z.string().default("🤖"),
  tags: z.array(z.string()).default([]),
  systemPrompt: z.string().min(20),
  model: z.string().min(1),
  openingMessage: z.string().optional(),
  openingQuestions: z.array(z.string()).default([]),
  liveChatEnabled: z.boolean().default(false),
  selectedToolIds: z.array(z.string()).default([]),
  selectedSkillIds: z.array(z.string()).default([]),
  selectedMcpServerIds: z.array(z.string()).default([]),
  selectedWorkflowIds: z.array(z.string()).default([]),
  useKnowledgeBase: z.boolean().default(false),
  knowledgeBaseGroupIds: z.array(z.string()).default([]),
  uncertainty: UncertaintySchema.default({}),
  reasoning: z.string().optional(),
})

export type ProposeAgentInput = z.infer<typeof ProposeAgentInputSchema>

export const RefineAgentInputSchema = ProposeAgentInputSchema.partial().extend({
  uncertainty: UncertaintySchema.optional(),
})

export type RefineAgentInput = z.infer<typeof RefineAgentInputSchema>

export const WizardStreamRequestSchema = z.object({
  messages: z.array(WizardMessageSchema).max(40),
  draft: WizardDraftSchema,
})

export type WizardStreamRequest = z.infer<typeof WizardStreamRequestSchema>
