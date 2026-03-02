import { generateText, stepCountIs } from "ai"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { prisma } from "@/lib/prisma"
import { resolveToolsForAssistant } from "@/lib/tools/registry"
import { resolveSkillsForAssistant } from "@/lib/skills/resolver"
import type { ToolContext } from "@/lib/tools/types"
import type { WorkflowNodeData, AgentNodeData } from "../types"
import type { ExecutionContext } from "../engine"
import { buildTemplateContext } from "../engine"
import { resolveTemplate } from "../template-engine"
import { extractPrompt } from "./llm"

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

  const openrouter = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY || "",
  })

  const model = openrouter(assistant.model || "openai/gpt-4o-mini")

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
    nodeData.assistantId, assistant.model || "openai/gpt-4o-mini", toolContext
  )

  const hasTools = Object.keys(tools).length > 0
  const maxSteps = nodeData.maxSteps ?? 5

  const result = await generateText({
    model,
    system: systemPrompt,
    prompt,
    ...(hasTools ? { tools, stopWhen: stepCountIs(maxSteps) } : {}),
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
