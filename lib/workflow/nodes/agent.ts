import { generateText } from "ai"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { prisma } from "@/lib/prisma"
import type { WorkflowNodeData, AgentNodeData } from "../types"
import type { ExecutionContext } from "../engine"

/**
 * Agent node handler — loads an assistant and generates text using its config.
 */
export async function executeAgent(
  data: WorkflowNodeData,
  input: unknown,
  _context: ExecutionContext
): Promise<{ output: unknown }> {
  const nodeData = data as AgentNodeData

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

  const prompt =
    nodeData.promptTemplate?.replace("{{input}}", JSON.stringify(input)) ||
    `Process the following input:\n${JSON.stringify(input)}`

  const result = await generateText({
    model,
    system: assistant.systemPrompt || undefined,
    prompt,
  })

  return { output: { text: result.text, model: assistant.model } }
}
