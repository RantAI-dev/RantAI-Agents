import { generateText, stepCountIs } from "ai"
import { getChatProvider, resolveModelId } from "@/lib/llm/provider"
import { DEFAULT_MODEL_ID } from "@/lib/models"
import { prisma } from "@/lib/prisma"
import { resolveToolsForAssistant } from "@/lib/tools/registry"
import { resolveSkillsForAssistant } from "@/lib/skills/resolver"
import type { ToolContext } from "@/lib/tools/types"
import type { WorkflowNodeData, AgentNodeData } from "../types"
import type { ExecutionContext } from "../engine"
import { buildTemplateContext } from "../engine"
import { resolveTemplate } from "../template-engine"
import { extractPrompt } from "./llm"
import { reportWorkflowUsage } from "../usage-hook"

/**
 * Agent node handler — loads an assistant and generates text using its config,
 * including tools, skills, and knowledge base when available.
 */
export async function executeAgent(
  data: WorkflowNodeData,
  input: unknown,
  context: ExecutionContext
): Promise<{ output: unknown }> {
  const nodeData = data as AgentNodeData
  const tctx = buildTemplateContext(data.label, data.nodeType, input, context)

  if (!nodeData.assistantId) {
    throw new Error("Agent node: no assistant selected")
  }

  // Load assistant config
  const assistant = await prisma.assistant.findUnique({
    where: { id: nodeData.assistantId },
  })

  if (!assistant) {
    throw new Error(`Agent node: assistant ${nodeData.assistantId} not found`)
  }

  const modelId = assistant.model || DEFAULT_MODEL_ID
  const model = getChatProvider()(resolveModelId(modelId))

  const prompt = nodeData.promptTemplate
    ? resolveTemplate(nodeData.promptTemplate, tctx)
    : extractPrompt(input)

  // Build system prompt with skills
  let systemPrompt = assistant.systemPrompt || undefined
  const skillsPrompt = await resolveSkillsForAssistant(nodeData.assistantId)
  if (skillsPrompt) {
    systemPrompt = systemPrompt ? `${systemPrompt}\n\n${skillsPrompt}` : skillsPrompt
  }

  // Resolve tools for the assistant
  const toolContext: ToolContext = {
    assistantId: nodeData.assistantId,
    userId: context.userId,
    organizationId: context.organizationId,
    sessionId: context.runId,
  }
  const { tools } = await resolveToolsForAssistant(
    nodeData.assistantId, modelId, toolContext
  )

  const hasTools = Object.keys(tools).length > 0
  const maxSteps = nodeData.maxSteps ?? 5

  const result = await generateText({
    model,
    system: systemPrompt,
    prompt,
    ...(hasTools ? { tools, stopWhen: stepCountIs(maxSteps) } : {}),
  })

  reportWorkflowUsage({
    organizationId: context.organizationId,
    userId: context.userId,
    modelId,
    inputTokens: result.usage?.inputTokens ?? 0,
    outputTokens: result.usage?.outputTokens ?? 0,
  })

  return {
    output: {
      text: result.text,
      model: assistant.model,
      usage: result.usage,
      toolCalls: result.steps?.flatMap(s => s.toolCalls || []) || [],
      stepCount: result.steps?.length || 1,
    },
  }
}
