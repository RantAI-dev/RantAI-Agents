import { generateText } from "ai"
import { getChatProvider, resolveModelId } from "@/lib/llm/provider"
import { DEFAULT_MODEL_ID } from "@/lib/models"
import type { WorkflowNodeData, LlmNodeData } from "../types"
import type { ExecutionContext } from "../engine"
import { buildTemplateContext } from "../engine"
import { resolveTemplate } from "../template-engine"
import { reportWorkflowUsage } from "../usage-hook"

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

  const modelId = nodeData.model || DEFAULT_MODEL_ID
  const model = getChatProvider()(resolveModelId(modelId))

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

  // Meter usage against credits / rantai limits (workflow model calls were
  // previously unmetered). Fire-and-forget via the cloud-provided reporter.
  reportWorkflowUsage({
    organizationId: context.organizationId,
    userId: context.userId,
    modelId,
    inputTokens: result.usage?.inputTokens ?? 0,
    outputTokens: result.usage?.outputTokens ?? 0,
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
