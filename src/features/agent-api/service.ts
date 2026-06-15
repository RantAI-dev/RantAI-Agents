import { streamText, convertToModelMessages, stepCountIs } from "ai"
import { getChatProvider, resolveModelId } from "@/lib/llm/provider"
import { DEFAULT_MODEL_ID, isValidModelAsync } from "@/lib/models"
import { resolveToolsForAssistant } from "@/lib/tools"
import { buildToolInstruction, LANGUAGE_INSTRUCTION, OUTPUT_HYGIENE_INSTRUCTION } from "@/lib/prompts/instructions"
import {
  smartRetrieve,
  formatContextForPrompt,
  smartHybridRetrieve,
  formatHybridContextForPrompt,
} from "@/lib/rag"
import { resolveSkillsForAssistant } from "@/lib/skills/resolver"
import { checkRateLimit } from "@/lib/embed/rate-limiter"
import { authenticateAgentApiKey } from "@/features/agent-api-keys/service"
import { incrementAgentApiKeyUsage } from "@/features/agent-api-keys/repository"
import { prisma } from "@/lib/prisma"
import type { V1ChatCompletionInput } from "./schema"

interface AuthResult {
  apiKey: { id: string; assistantId: string; scopes: string[]; ipWhitelist: string[] }
  assistant: { id: string; name: string; emoji: string | null }
}

async function loadAssistantFull(assistantId: string) {
  return prisma.assistant.findUnique({
    where: { id: assistantId },
    select: {
      id: true,
      name: true,
      systemPrompt: true,
      model: true,
      useKnowledgeBase: true,
      knowledgeBaseGroupIds: true,
      modelConfig: true,
      guardRails: true,
      memoryConfig: true,
    },
  })
}

export async function authenticateV1Request(
  authHeader: string | null
): Promise<AuthResult | { status: number; error: string }> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { status: 401, error: "Missing or invalid Authorization header. Expected: Bearer rantai_sk_..." }
  }

  const key = authHeader.slice(7)
  const result = await authenticateAgentApiKey(key)
  if (!result) {
    return { status: 401, error: "Invalid or expired API key" }
  }

  return {
    apiKey: {
      id: result.apiKey.id,
      assistantId: result.apiKey.assistantId,
      scopes: result.apiKey.scopes,
      ipWhitelist: result.apiKey.ipWhitelist,
    },
    assistant: result.assistant,
  }
}

export async function runV1ChatCompletion(
  auth: AuthResult,
  input: V1ChatCompletionInput,
  abortSignal?: AbortSignal,
  modelOverride?: string
): Promise<Response> {
  // Rate limit
  const rateResult = checkRateLimit(auth.apiKey.id)
  if (!rateResult.allowed) {
    return new Response(
      JSON.stringify({ error: { message: "Rate limit exceeded", type: "rate_limit_error" } }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(rateResult.resetIn),
          "X-RateLimit-Remaining": "0",
        },
      }
    )
  }

  // Check scope
  const wantStream = input.stream
  const requiredScope = wantStream ? "chat:stream" : "chat"
  if (auth.apiKey.scopes.length > 0 && !auth.apiKey.scopes.includes(requiredScope) && !auth.apiKey.scopes.includes("chat")) {
    return new Response(
      JSON.stringify({ error: { message: `API key does not have scope: ${requiredScope}`, type: "permission_error" } }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    )
  }

  // Increment usage in background
  incrementAgentApiKeyUsage(auth.apiKey.id).catch(() => {})

  // Load full assistant config
  const assistant = await loadAssistantFull(auth.apiKey.assistantId)
  if (!assistant) {
    return new Response(
      JSON.stringify({ error: { message: "Assistant not found", type: "not_found_error" } }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    )
  }

  // Chatflow-bound assistants need the full chatflow runtime (state, branching,
  // tool nodes) which is not wired into the OpenAI-compatible response shape.
  // Refuse upfront rather than fall through silently to single-turn streamText
  // and produce broken behavior.
  const activeChatflow = await prisma.workflow.findFirst({
    where: { assistantId: assistant.id, mode: "CHATFLOW", status: "ACTIVE" },
    select: { id: true },
  })
  if (activeChatflow) {
    return new Response(
      JSON.stringify({
        error: {
          message:
            "This assistant is bound to an active chatflow workflow. Chatflow execution is not supported via the OpenAI-compatible API yet — use the dashboard chat surface instead.",
          type: "unsupported_assistant_error",
        },
      }),
      { status: 422, headers: { "Content-Type": "application/json" } }
    )
  }

  let systemPrompt = assistant.systemPrompt || "You are a helpful AI assistant."
  systemPrompt += LANGUAGE_INSTRUCTION
  systemPrompt += OUTPUT_HYGIENE_INSTRUCTION

  const requestedModel = modelOverride || assistant.model
  const modelId = (await isValidModelAsync(requestedModel)) ? requestedModel : DEFAULT_MODEL_ID
  const modelConfig = (assistant.modelConfig && typeof assistant.modelConfig === "object")
    ? assistant.modelConfig as Record<string, unknown>
    : null

  // Guard rails
  if (assistant.guardRails && typeof assistant.guardRails === "object") {
    const { buildGuardRailsPrompt } = await import("@/lib/prompts/guard-rails")
    const guardRailsPrompt = buildGuardRailsPrompt(assistant.guardRails as Record<string, unknown>)
    if (guardRailsPrompt) systemPrompt += guardRailsPrompt
  }

  // ===== KNOWLEDGE BASE (RAG) =====
  // Extract user query from the last user message for RAG retrieval
  const lastUserMsg = [...input.messages].reverse().find((m) => m.role === "user")
  const rawUserQuery = lastUserMsg?.content || ""

  if (assistant.useKnowledgeBase && rawUserQuery) {
    try {
      const groupIds = assistant.knowledgeBaseGroupIds.length > 0
        ? assistant.knowledgeBaseGroupIds
        : undefined

      // Directory listing — same as chat-public; gives the model the full doc
      // inventory for enumerate-style queries without burning chunks on it.
      if (groupIds && groupIds.length > 0) {
        try {
          const { findDocumentsByGroups } = await import("@/features/knowledge/groups/repository")
          const directory = await findDocumentsByGroups(groupIds, 200)
          if (directory.length > 0 && directory.length < 200) {
            const lines = directory.map((d) => {
              const cats = d.categories?.length ? ` [${d.categories.join(", ")}]` : ""
              const sub = d.subcategory ? ` — ${d.subcategory}` : ""
              return `- ${d.title}${sub}${cats}`
            }).join("\n")
            systemPrompt += `\n\n## Available Documents in Knowledge Base\nThis assistant has access to ${directory.length} documents. Use the list when the user asks to enumerate, list, or count available documents; for specific questions, rely on the retrieved excerpts below.\n\n${lines}`
          }
        } catch (err) {
          console.warn("[V1 API] Directory injection failed:", err)
        }
      }

      // Standalone-query rewrite for multi-turn refs ("tell me more") — same
      // env gate (KB_STANDALONE_QUERY_ENABLED) as chat-public.
      const messagesAsAny = input.messages.map((m) => ({ role: m.role, content: m.content }))
      const { rewriteStandaloneQuery } = await import("@/lib/rag/standalone-query")
      const userQuery = await rewriteStandaloneQuery(messagesAsAny)
      if (userQuery !== rawUserQuery) {
        console.log(`[V1 API] standalone-query rewrite: "${rawUserQuery.slice(0, 60)}" -> "${userQuery.slice(0, 80)}"`)
      }

      // Try hybrid retrieval first, fall back to vector-only.
      // maxResults / maxChunks unset → picks up KB_DEFAULT_MAX_CHUNKS from config.
      const hybridResult = await smartHybridRetrieve(userQuery, {
        enableEntitySearch: true,
        groupIds,
      })

      if (hybridResult.context) {
        const formattedContext = formatHybridContextForPrompt(hybridResult)
        systemPrompt = `${systemPrompt}\n\n${formattedContext}`
        console.log(`[V1 API] RAG hybrid: ${hybridResult.results.length} chunks`)
      } else {
        const retrievalResult = await smartRetrieve(userQuery, {
          minSimilarity: 0.30,
          groupIds,
        })
        if (retrievalResult.context) {
          const formattedContext = formatContextForPrompt(retrievalResult)
          systemPrompt = `${systemPrompt}\n\n${formattedContext}`
          console.log(`[V1 API] RAG vector: ${retrievalResult.chunks.length} chunks`)
        }
      }
    } catch (error) {
      console.error("[V1 API] RAG retrieval error:", error)
      // Continue without RAG context — graceful degradation
    }
  }

  // ===== SKILLS =====
  const syntheticUserId = `api_key_${auth.apiKey.id}`
  try {
    const skillPrompt = await resolveSkillsForAssistant(assistant.id, undefined, syntheticUserId)
    if (skillPrompt) {
      systemPrompt += "\n\n" + skillPrompt
    }
  } catch (error) {
    console.error("[V1 API] Skill resolution error:", error)
  }

  // Resolve tools for the assistant
  const { tools: resolvedTools, toolNames } = await resolveToolsForAssistant(
    assistant.id,
    modelId,
    { userId: syntheticUserId, assistantId: assistant.id }
  )

  if (Object.keys(resolvedTools).length > 0) {
    systemPrompt += buildToolInstruction(toolNames, {})
  }

  // Convert messages to model format
  const uiMessages = input.messages.map((msg, idx) => ({
    id: `msg_${idx}`,
    role: msg.role as "system" | "user" | "assistant",
    parts: [{ type: "text" as const, text: msg.content }],
  }))
  const messages = await convertToModelMessages(uiMessages)

  // Request ID for the response
  const requestId = `chatcmpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

  const { createStripThinkTransform } = await import("@/lib/llm/strip-think")
  const result = streamText({
    model: getChatProvider()(resolveModelId(modelId)),
    system: systemPrompt,
    messages,
    tools: resolvedTools,
    stopWhen: Object.keys(resolvedTools).length > 0 ? stepCountIs(5) : stepCountIs(2),
    experimental_transform: createStripThinkTransform(),
    ...(abortSignal && { abortSignal }),
    ...(input.temperature != null && { temperature: input.temperature }),
    ...(input.top_p != null && { topP: input.top_p }),
    ...(input.max_tokens != null && { maxTokens: input.max_tokens }),
    ...(modelConfig?.temperature != null && input.temperature == null && { temperature: Number(modelConfig.temperature) }),
    ...(modelConfig?.topP != null && input.top_p == null && { topP: Number(modelConfig.topP) }),
    ...(modelConfig?.maxTokens != null && input.max_tokens == null && { maxTokens: Number(modelConfig.maxTokens) }),
  })

  if (wantStream) {
    return createSSEStreamResponse(result, requestId, modelId)
  }

  return createJsonResponse(result, requestId, modelId)
}

function createSSEStreamResponse(
  result: ReturnType<typeof streamText>,
  requestId: string,
  modelId: string
): Response {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of result.textStream) {
          const data = JSON.stringify({
            id: requestId,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: modelId,
            choices: [
              {
                index: 0,
                delta: { content: chunk },
                finish_reason: null,
              },
            ],
          })
          controller.enqueue(encoder.encode(`data: ${data}\n\n`))
        }

        // Final chunk with finish_reason
        const finalData = JSON.stringify({
          id: requestId,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: modelId,
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: "stop",
            },
          ],
        })
        controller.enqueue(encoder.encode(`data: ${finalData}\n\n`))
        controller.enqueue(encoder.encode("data: [DONE]\n\n"))
        controller.close()
      } catch (err) {
        const errorData = JSON.stringify({
          error: { message: "Stream error", type: "server_error" },
        })
        controller.enqueue(encoder.encode(`data: ${errorData}\n\n`))
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  })
}

async function createJsonResponse(
  result: ReturnType<typeof streamText>,
  requestId: string,
  modelId: string
): Promise<Response> {
  const text = await result.text

  const body = {
    id: requestId,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: modelId,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  }

  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  })
}
