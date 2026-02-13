import { streamText } from "ai"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { DEFAULT_MODEL_ID } from "@/lib/models"
import type { WorkflowNodeData, StreamOutputNodeData } from "../types"
import type { ExecutionContext } from "../engine"
import { buildTemplateContext } from "../engine"
import { resolveTemplate } from "../template-engine"
import { getIOInstance } from "@/lib/socket"
import { extractPrompt } from "./llm"

/**
 * STREAM_OUTPUT node handler — terminal node in chatflow workflows.
 *
 * Uses streamText to send per-token chunks via Socket.io in real-time.
 * Returns the full accumulated text as output when streaming completes.
 */
export async function executeStreamOutput(
  data: WorkflowNodeData,
  input: unknown,
  context: ExecutionContext
): Promise<{ output: unknown }> {
  const nodeData = data as StreamOutputNodeData
  const tctx = buildTemplateContext(data.label, data.nodeType, input, context)

  const openrouter = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY || "",
  })

  const model = openrouter(nodeData.model || DEFAULT_MODEL_ID)

  // Resolve system prompt through template engine
  const systemPrompt = nodeData.systemPrompt
    ? resolveTemplate(nodeData.systemPrompt, tctx)
    : undefined

  // Build prompt from input — handles structured data from RAG, LLM, etc.
  const prompt = buildStreamNodePrompt(input, context)

  const result = streamText({
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

  // Stream chunks to client via Socket.io
  let fullText = ""
  const io = getIOInstance()

  for await (const chunk of (await result).textStream) {
    fullText += chunk

    // Emit each chunk to clients watching this run
    if (io) {
      try {
        io.to(`workflow:${context.runId}`).emit("workflow:step:stream-chunk", {
          runId: context.runId,
          nodeId: data.label,
          chunk,
          accumulated: fullText,
        })
      } catch {
        // Never let socket errors break execution
      }
    }
  }

  const finalResult = await result

  return {
    output: {
      text: fullText,
      model: nodeData.model,
      usage: finalResult.usage,
      finishReason: finalResult.finishReason,
    },
  }
}

/**
 * Build a clean prompt for STREAM_OUTPUT from upstream node outputs.
 *
 * Strategy (Flowise pattern):
 * 1. User message is always the primary prompt
 * 2. RAG context is supplementary — appended when available
 * 3. Classification/intermediate outputs are ignored (system prompt handles behavior)
 */
function buildStreamNodePrompt(input: unknown, context: ExecutionContext): string {
  const flowInput = context.flow?.input as Record<string, unknown> | undefined
  const userMessage = extractUserMessage(flowInput)
  const ragContext = extractRagContext(input)

  // RAG + user message → structured prompt
  if (ragContext && userMessage) {
    return `User question: ${userMessage}\n\nRelevant context:\n${ragContext}\n\nPlease answer the user's question based on the context above.`
  }

  // No RAG — use user message directly (system prompt handles behavior)
  if (userMessage) return userMessage

  // Fallback: extract any text from input
  if (typeof input === "string") return input
  if (input && typeof input === "object") {
    const obj = input as Record<string, unknown>
    if (typeof obj.text === "string") return obj.text
    if (typeof obj.message === "string") return obj.message
  }

  return extractPrompt(input)
}

/** Extract original user message from flow input */
function extractUserMessage(input: unknown): string | null {
  if (!input) return null
  if (typeof input === "string") return input
  if (typeof input === "object") {
    const obj = input as Record<string, unknown>
    if (typeof obj.message === "string") return obj.message
    if (typeof obj.question === "string") return obj.question
  }
  return null
}

/** Extract RAG context from accumulated upstream outputs */
function extractRagContext(input: unknown): string | null {
  if (!input) return null
  // Single RAG output: { context: "...", sources: [...] }
  if (typeof input === "object" && !Array.isArray(input)) {
    const obj = input as Record<string, unknown>
    if (typeof obj.context === "string") return obj.context
  }
  // Array of outputs (e.g., Merge → STREAM_OUTPUT with multiple RAG results)
  if (Array.isArray(input)) {
    const contexts = input
      .filter((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).context === "string")
      .map((item) => (item as Record<string, unknown>).context as string)
    if (contexts.length > 0) return contexts.join("\n\n")
  }
  return null
}
