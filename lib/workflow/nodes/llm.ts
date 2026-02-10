import { generateText } from "ai"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import type { WorkflowNodeData, LlmNodeData } from "../types"
import type { ExecutionContext } from "../engine"

/**
 * LLM / Prompt node handler — direct LLM call with configured model.
 */
export async function executeLlm(
  data: WorkflowNodeData,
  input: unknown,
  _context: ExecutionContext
): Promise<{ output: unknown }> {
  const nodeData = data as LlmNodeData

  const openrouter = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY || "",
  })

  const model = openrouter(nodeData.model || "openai/gpt-4o-mini")

  const prompt = typeof input === "string" ? input : JSON.stringify(input)

  const result = await generateText({
    model,
    system: nodeData.systemPrompt || undefined,
    prompt,
    temperature: nodeData.temperature,
  })

  return { output: { text: result.text } }
}
