import { generateText } from "ai"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import type { WorkflowNodeData, LlmNodeData } from "../types"
import type { ExecutionContext } from "../engine"
import { buildTemplateContext } from "../engine"
import { resolveTemplate } from "../template-engine"

/**
 * LLM / Prompt node handler — direct LLM call with configured model.
 */
export async function executeLlm(
  data: WorkflowNodeData,
  input: unknown,
  context: ExecutionContext
): Promise<{ output: unknown }> {
  const nodeData = data as LlmNodeData
  const tctx = buildTemplateContext(data.label, data.nodeType, input, context)

  const openrouter = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY || "",
  })

  const model = openrouter(nodeData.model || "openai/gpt-4o-mini")

  // Resolve system prompt and input through template engine
  const systemPrompt = nodeData.systemPrompt
    ? resolveTemplate(nodeData.systemPrompt, tctx)
    : undefined

  // Extract a clean prompt from structured input
  const prompt = extractPrompt(input)

  const result = await generateText({
    model,
    system: systemPrompt,
    prompt,
    temperature: nodeData.temperature,
    maxOutputTokens: nodeData.maxTokens,
    topP: nodeData.topP,
    frequencyPenalty: nodeData.frequencyPenalty,
    presencePenalty: nodeData.presencePenalty,
    stopSequences: nodeData.stopSequences,
  })

  // Consistent output format — always {text, usage, finishReason}.
  // Use OUTPUT_PARSER node downstream to parse JSON when needed (Flowise pattern).
  return {
    output: { text: result.text, usage: result.usage, finishReason: result.finishReason },
  }
}

/**
 * Extract a clean prompt string from various input formats.
 * Nodes upstream may pass structured objects — we need to find the
 * meaningful text content to send to the LLM.
 */
export function extractPrompt(input: unknown): string {
  if (typeof input === "string") return input

  if (input && typeof input === "object") {
    const obj = input as Record<string, unknown>

    // Chatflow trigger: { message: "user text" }
    if (typeof obj.message === "string") return obj.message

    // LLM/Agent output: { text: "response" }
    if (typeof obj.text === "string") return obj.text

    // RAG output: { context: "...", sources: [...] }
    if (typeof obj.context === "string") {
      const sources = Array.isArray(obj.sources) ? obj.sources : []
      const sourceInfo = sources.length > 0
        ? `\n\nSources: ${sources.map((s: { title?: string }) => s.title || "unknown").join(", ")}`
        : ""
      return obj.context + sourceInfo
    }

    // Explicit query/question field
    if (typeof obj.query === "string") return obj.query
    if (typeof obj.question === "string") return obj.question
  }

  // Fallback: stringify
  return typeof input === "undefined" ? "" : JSON.stringify(input)
}
