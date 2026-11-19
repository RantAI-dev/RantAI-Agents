import { streamText, convertToModelMessages, stepCountIs } from "ai"
import { getChatProvider, resolveModelId } from "@/lib/llm/provider"
import { DEFAULT_MODEL_ID, isValidModelAsync, getModelByIdAsync } from "@/lib/models"
import { ensureProviderRegistryLoaded, getPlatformDefaultModel } from "@/lib/llm/provider-registry"
import { resolveToolsForAssistant } from "@/lib/tools"
import { buildPlatformContextInstruction, buildToolInstruction, LANGUAGE_INSTRUCTION, OUTPUT_HYGIENE_INSTRUCTION } from "@/lib/prompts/instructions"
import { getHouseModel } from "@/lib/llm/house-models"
import { applyInputLimits, inputLimits } from "./limits"
import { groundingOf, groundingThreshold, type Grounding } from "./grounding"
import { anchorEnabled, anchoredQuery } from "./anchor-query"
import { rewriteQueryForRetrieval } from "./query-rewrite"
import { assistantScopeGroups, listMapelForAssistant, resolveMapel } from "./mapel"
import {
  smartRetrieve,
  formatContextForPrompt,
  formatHybridContextForPrompt,
} from "@/lib/rag"
import { retrieveForGroups } from "./kb-retrieval"
import {
  scoreSources,
  type ChunkLike,
  type ScoredSource,
  type SourceSelection,
} from "./source-selection"
import { attachPageUrls } from "./source-links"
import { resolveSkillsForAssistant } from "@/lib/skills/resolver"
import { checkRateLimit } from "@/lib/embed/rate-limiter"
import { authenticateAgentApiKey } from "@/features/agent-api-keys/service"
import { incrementAgentApiKeyUsage } from "@/features/agent-api-keys/repository"
import { prisma } from "@/lib/prisma"
import type { V1ChatCompletionInput } from "./schema"
import { createJsonResponse, createSSEStreamResponse } from "./response"
import { createInlineFigureFeed, figureDownloadForRemote } from "./inline-figures"
import { downloadFile } from "@/lib/s3"
import { remoteAssetDownload } from "@/lib/kb-client/remote-hybrid"

interface AuthResult {
  apiKey: { id: string; assistantId: string; scopes: string[]; ipWhitelist: string[] }
  assistant: { id: string; name: string; emoji: string | null }
}

/**
 * Context-window budget, in tokens, for everything we send upstream.
 *
 * A self-hosted model has a hard ceiling (`--max-model-len`), and a prompt that
 * approaches it does NOT fail loudly — it leaves no room to answer in, so the
 * model emits a handful of tokens and stops. In production that surfaced as
 * confident half-sentences cut mid-word: an 8192-token server receiving an
 * ~8100-token prompt of retrieved chunks. Past the ceiling it is a 400 the
 * client sees as a 500.
 *
 * So retrieval is trimmed to fit, and output room is always reserved. Both are
 * env-tunable because the ceiling belongs to the deployment, not the code.
 */
const PROMPT_TOKEN_BUDGET = Number(process.env.LLM_PROMPT_TOKEN_BUDGET || 6000)
const RESERVED_OUTPUT_TOKENS = Number(process.env.LLM_RESERVED_OUTPUT_TOKENS || 1024)

/** Rough token estimate. Deliberately pessimistic: over-estimating costs a few
 *  dropped excerpts, under-estimating costs the whole answer. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.4)
}

/**
 * Trim a formatted RAG block so prompt + reserved output stays inside budget.
 *
 * Excerpts are cut from the end, which is the right end to lose: retrieval
 * returns them ranked, so the tail is the least relevant. The `Sources:` footer
 * is kept whatever happens — dropping it would leave inline `[n]` citations
 * pointing at a list that is not there.
 */
export function fitContext(formattedContext: string, promptSoFar: string): string {
  const available =
    PROMPT_TOKEN_BUDGET - RESERVED_OUTPUT_TOKENS - estimateTokens(promptSoFar)
  if (available <= 0) {
    console.warn("[V1 API] prompt already exceeds budget before RAG — context dropped")
    return ""
  }
  if (estimateTokens(formattedContext) <= available) return formattedContext

  const sourcesAt = formattedContext.lastIndexOf("\nSources:")
  const head = sourcesAt === -1 ? formattedContext : formattedContext.slice(0, sourcesAt)
  const footer = sourcesAt === -1 ? "" : formattedContext.slice(sourcesAt)

  const parts = head.split("\n\n---\n\n")
  const kept: string[] = []
  let used = estimateTokens(footer)
  for (const part of parts) {
    const cost = estimateTokens(part)
    if (used + cost > available) break
    kept.push(part)
    used += cost
  }
  if (kept.length === 0) kept.push(parts[0].slice(0, Math.max(0, available * 3)))
  console.warn(
    `[V1 API] context trimmed to fit: ${parts.length} → ${kept.length} excerpts`
  )
  return kept.join("\n\n---\n\n") + footer
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
      organizationId: true,
      modelConfig: true,
      guardRails: true,
      memoryConfig: true,
    },
  })
}

/**
 * Resolve which knowledge bases a request may read.
 *
 * Precedence: an explicit `knowledge_base_ids` wins over the assistant's
 * configured set, `["*"]` means every knowledge base the ASSISTANT may read
 * (its grade's groups and their subject children — `assistantScopeGroups`),
 * and omitting the field keeps the assistant's own configuration.
 *
 * Whatever is asked for, the result is intersected with that assistant
 * scope. Grade isolation (PRD): an organisation-mate id from another grade
 * is exactly as unreachable as another tenant's, so a grade assistant can
 * never read another grade's books. An id outside the scope is dropped
 * rather than refused, so a caller cannot use this field to probe which ids
 * exist elsewhere — the answer to a guessed id is identical to the answer
 * for one that was never valid.
 *
 * Returns `{ ids }` on success, or `{ error }` when the caller asked for
 * knowledge bases and none of them resolved — silently answering from the
 * whole scope after being asked for one subject would be worse than an
 * error.
 */
export async function resolveRequestedGroupIds(
  organizationId: string | null,
  assistantGroupIds: string[],
  requested: string[] | undefined,
): Promise<{ ids: string[] | undefined } | { error: string }> {
  if (!requested || requested.length === 0) {
    return { ids: assistantGroupIds.length > 0 ? assistantGroupIds : undefined }
  }
  const scope = new Set(
    (await assistantScopeGroups({ organizationId, knowledgeBaseGroupIds: assistantGroupIds }))
      .map((g) => g.id),
  )

  if (requested.includes("*")) {
    if (scope.size === 0) {
      return {
        error:
          "No knowledge bases are available to this assistant. " +
          "Call GET /api/v1/knowledge-bases to list the ids you may use, and GET /api/v1/mapel for the available subjects.",
      }
    }
    return { ids: [...scope] }
  }

  const ids = requested.filter((id) => scope.has(id))
  if (ids.length === 0) {
    return {
      error:
        "None of the requested knowledge_base_ids are available to this assistant. " +
        "Call GET /api/v1/knowledge-bases to list the ids you may use, and GET /api/v1/mapel for the available subjects.",
    }
  }
  return { ids }
}

export type V1AuthError = { status: number; error: string; type: string }

/**
 * UAT issue 3 ("dead end" answers): when retrieval comes back below the
 * grounding threshold, the retrieved context must NOT reach the model. Left
 * in, it flavoured the refusal — the model padded "the books don't cover
 * this" with whatever context was least relevant. This replaces the context
 * with a short instruction instead: say the information is not available,
 * briefly and in the user's language, and nothing else. The retrieved
 * excerpts are also kept out of the sources and figures of the response.
 */
const UNGROUNDED_INSTRUCTION = `

## Knowledge Base Coverage

The books available to this assistant do not cover this question — the retrieved excerpts were too weakly related to be used. Reply briefly, in the language of the user's question, that the information is not available in the available books. You may suggest rephrasing the question or picking the right subject. Do not add facts, background, or related material from any source, and do not cite any source.`

/**
 * "refuse" is the fix (issue 3). "keep" — AGENT_API_UNGROUNDED_CONTEXT=keep
 * — restores today's behaviour for a deployment that wants the old answers:
 * the weak context is appended and every retrieved source is returned,
 * with the relevance floor and the cited-only default both skipped, so the
 * flag rolls the whole filtering back, not half of it.
 */
function ungroundedContextMode(env: NodeJS.ProcessEnv = process.env): "refuse" | "keep" {
  return env.AGENT_API_UNGROUNDED_CONTEXT === "keep" ? "keep" : "refuse"
}

/** One retrieved source in the shape BOTH engines' results expose it in
 *  (HybridRetrievalResult.sources / RetrievalResult.sources; the remote
 *  mapping fills the same fields — see lib/kb-client/remote-hybrid.ts). */
interface RetrievedSourceLike {
  documentId: string | null
  documentTitle: string
  section: string | null
  assetKey?: string | null
  page?: number | null
  chunkType?: string | null
  chunkIndex?: number | null
  anchorChunkIndex?: number | null
  kbOrigin?: "remote"
}

/** The retrieved source entry in the response's wire shape — today's
 *  mapping, unchanged field for field (title ← documentTitle, etc.). */
function wireSourceBase(sources: RetrievedSourceLike[]) {
  return sources.map((s) => ({
    title: s.documentTitle,
    section: s.section,
    documentId: s.documentId ?? null,
    assetKey: s.assetKey ?? null,
    page: s.page ?? null,
    chunkType: s.chunkType ?? null,
    chunkIndex: s.chunkIndex ?? null,
    anchorChunkIndex: s.anchorChunkIndex ?? null,
    ...(s.kbOrigin ? { kbOrigin: s.kbOrigin } : {}),
  }))
}

/**
 * The grounding gate both retrieval branches go through (UAT issues 3,
 * 4 and 7).
 *
 * Grounded: today's behaviour — the formatted context is appended, and the
 * sources are scored against the SAME threshold the grounding decision
 * used, so the response can drop sources whose best chunk is below it
 * while the `[n]` numbers stay the ones the model saw. The context keeps
 * its ranked chunks as today; only the returned list is filtered.
 *
 * Ungrounded: refuse mode (default) replaces the context with
 * UNGROUNDED_INSTRUCTION and returns no sources; keep mode restores
 * today's behaviour exactly (context + every source, floor skipped).
 */
function applyGroundingGate<T extends ChunkLike>(input: {
  /** The prompt as built so far. */
  systemPrompt: string
  /** Formats + budget-fits the retrieved context; called only when it will
   *  actually be used, so refusing costs no formatting. */
  formatContext: () => string
  grounded: boolean
  /** The threshold grounding was decided with — the floor uses the same
   *  one, so "ungrounded" and "every source below the floor" can never
   *  disagree. */
  threshold: number
  /** grounding.retrieval_score, for the ungrounded log line. */
  retrievalScore: number
  sources: RetrievedSourceLike[]
  chunks: T[]
  chunkScore: (chunk: T) => number
}): {
  systemPrompt: string
  sources: ScoredSource[]
  ungroundedKeptSources: boolean
  refused: boolean
} {
  if (input.grounded) {
    const formattedContext = input.formatContext()
    return {
      systemPrompt: `${input.systemPrompt}\n\n${formattedContext}`,
      sources: scoreSources(
        wireSourceBase(input.sources),
        input.chunks,
        input.chunkScore,
        input.threshold,
      ),
      ungroundedKeptSources: false,
      refused: false,
    }
  }

  const mode = ungroundedContextMode()
  // One line per ungrounded request, with the decision and the numbers it
  // was made on, so a deployment can calibrate the threshold from logs.
  console.log(
    `[V1 API] ungrounded: score=${input.retrievalScore} threshold=${input.threshold} mode=${mode}`,
  )
  if (mode === "refuse") {
    return {
      systemPrompt: input.systemPrompt + UNGROUNDED_INSTRUCTION,
      // sources stay [] and figures are suppressed — the answer must not
      // show references it explicitly declined to use.
      sources: [],
      ungroundedKeptSources: false,
      refused: true,
    }
  }

  const formattedContext = input.formatContext()
  return {
    systemPrompt: `${input.systemPrompt}\n\n${formattedContext}`,
    // Floor 0 keeps every source: keep mode must reproduce today's list.
    sources: scoreSources(wireSourceBase(input.sources), input.chunks, input.chunkScore, 0),
    ungroundedKeptSources: true,
    refused: false,
  }
}

export async function authenticateV1Request(
  authHeader: string | null,
  requestHeaders?: Headers
): Promise<AuthResult | V1AuthError> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      status: 401,
      error: "Missing or invalid Authorization header. Expected: Bearer rantai_sk_...",
      type: "authentication_error",
    }
  }

  const key = authHeader.slice(7)
  // Client IP for ipWhitelist enforcement: first hop of x-forwarded-for, else x-real-ip.
  const requestIp =
    requestHeaders?.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    requestHeaders?.get("x-real-ip")?.trim() ||
    undefined
  const result = await authenticateAgentApiKey(key, requestIp)
  if (!result) {
    return { status: 401, error: "Invalid or expired API key", type: "authentication_error" }
  }
  if ("error" in result && result.error === "ip_not_allowed") {
    return { status: 403, error: "IP address not allowed", type: "permission_error" }
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

/**
 * Source numbers (1-based, as in `[figure:N]`) of the figures retrieval
 * selected for this answer. Matched by asset key, because `sources` is built
 * and de-duplicated separately from the result list.
 */
export function selectedFigureNumbers(
  results: Array<{ assetKey?: string | null; chunkType?: string | null; figureSelected?: boolean }>,
  sources: Array<{ assetKey?: string | null; chunkType?: string | null }>,
): number[] {
  const keys = new Set(
    results.filter((r) => r.figureSelected && r.chunkType === "figure" && r.assetKey).map((r) => r.assetKey as string),
  )
  const out: number[] = []
  sources.forEach((s, i) => {
    if (s.chunkType === "figure" && s.assetKey && keys.has(s.assetKey)) out.push(i + 1)
  })
  return out
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

  // Input limits (off unless configured). Rejected before any retrieval or
  // model call, so an oversized request costs nothing.
  const limited = applyInputLimits(input.messages, inputLimits())
  if ("error" in limited) {
    return new Response(
      JSON.stringify({ error: { message: limited.error, type: "invalid_request_error", code: limited.code } }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    )
  }
  input = { ...input, messages: limited.messages }

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

  // The first request after a start would otherwise read an empty registry
  // and send a managed provider's model to OpenRouter.
  await ensureProviderRegistryLoaded()
  const requestedModel = modelOverride || assistant.model
  const modelId = (await isValidModelAsync(requestedModel)) ? requestedModel : getPlatformDefaultModel(DEFAULT_MODEL_ID)
  systemPrompt += buildPlatformContextInstruction({
    assistantName: assistant.name,
    modelName: getHouseModel(modelId)?.name ?? null,
  })
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

  // Sources surfaced back to the API client so an external frontend can render
  // reference cards ("which documents did the answer draw on"). kbOrigin marks
  // sources that came from rantai-kb so the inline-figure loader knows where
  // their bytes live; local sources leave it unset. Each entry also carries
  // its `[n]` number, best-chunk score and floor verdict (source-selection.ts);
  // the response builders filter the list once the answer text exists.
  let ragSources: ScoredSource[] = []
  // Retrieved chunks kept for selective VLM-at-answer (figure kind + assetKey).
  let vlmResults: import("@/lib/rag/vlm-figures").FigureCandidate[] = []
  // Set only when retrieval actually ran, so an assistant without a knowledge
  // base does not report every answer as ungrounded.
  let grounding: Grounding | undefined
  // True when this request was ungrounded but AGENT_API_UNGROUNDED_CONTEXT=keep
  // restored today's behaviour (context + every source, floor skipped).
  let ungroundedKeptSources = false
  // True when an ungrounded answer was refused: no context, sources, or
  // inline figures reach the model or the response (UAT issue 3).
  let ungroundedRefused = false
  if (assistant.useKnowledgeBase && rawUserQuery) {
    try {
      // A subject is a friendlier way to say "this one knowledge base". Sending
      // both is ambiguous, not a union, so it is refused rather than guessed at.
      if (input.mapel && input.knowledge_base_ids?.length) {
        return new Response(
          JSON.stringify({ error: { message: "Send either mapel or knowledge_base_ids, not both.", type: "invalid_request_error" } }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        )
      }
      let requestedGroupIds = input.knowledge_base_ids
      if (input.mapel) {
        const available = await listMapelForAssistant(assistant)
        const picked = resolveMapel(available, input.mapel)
        if ("error" in picked) {
          return new Response(
            JSON.stringify({
              error: { message: `${picked.error} Available: ${picked.available.join(", ")}`, type: "invalid_request_error" },
            }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          )
        }
        requestedGroupIds = picked.ids
      }
      const resolved = await resolveRequestedGroupIds(
        assistant.organizationId,
        assistant.knowledgeBaseGroupIds,
        requestedGroupIds,
      )
      if ("error" in resolved) {
        return new Response(
          JSON.stringify({ error: { message: resolved.error, type: "invalid_request_error" } }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        )
      }
      const groupIds = resolved.ids

      // Directory listing — same as chat-public; gives the model the full doc
      // inventory for enumerate-style queries without burning chunks on it.
      if (groupIds && groupIds.length > 0) {
        try {
          const { listDocumentsInKnowledgeGroups } = await import("@/features/knowledge/groups/service")
          const directory = await listDocumentsInKnowledgeGroups(groupIds, 200)
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

      // Standalone-query rewrite for multi-turn refs ("bandingkan dengan yang
      // tadi") — 2026-11-18 brief, task B. The base model rebuilds the last
      // question into a standalone search query from the recent turns, in
      // one short call; any failure, timeout or unusable reply searches the
      // original last message. Only retrieval sees the result — the
      // conversation sent to the answering model below is unchanged.
      //
      // Precedence: a successful model rewrite wins; a rewrite that RAN and
      // failed uses the original last message (the brief's failure rule).
      // The first-topic anchor (AGENT_API_ANCHOR_FIRST_TOPIC, uat-chat)
      // keeps its role as the no-model-call fallback for SHORT follow-ups,
      // but only while the rewrite is switched off entirely — the model
      // resolves references the anchor's concatenation cannot.
      const anchored = anchorEnabled() ? anchoredQuery(input.messages) : null
      const rewrite = await rewriteQueryForRetrieval(input.messages, rawUserQuery)
      const userQuery =
        rewrite.used === "rewritten" ? rewrite.query : rewrite.ran ? rawUserQuery : anchored ?? rawUserQuery

      // Try hybrid retrieval first, fall back to vector-only. Retrieval goes
      // through retrieveForGroups: rantai-kb serves the knowledge bases the
      // route table switched (with instant per-KB rollback to this engine),
      // everything else runs in-process as before.
      // maxResults / maxChunks unset → picks up KB_DEFAULT_MAX_CHUNKS from config.
      // enableEntitySearch is left to its default so KB_ENTITY_SEARCH_ENABLED
      // is honoured: passing `true` here overrode a deployment that had
      // switched the entity arm off because its corpus has no entity graph.
      const { result: hybridResult, groundedMinScore } = await retrieveForGroups(userQuery, {
        groupIds,
        organizationId: assistant.organizationId ?? undefined,
      })

      grounding = groundingOf(hybridResult.results.map((r) => r.vectorScore), groundedMinScore)
      if (hybridResult.context) {
        const applied = applyGroundingGate({
          systemPrompt,
          // Formatted (and budget-fitted) only when it will actually be used.
          formatContext: () => fitContext(formatHybridContextForPrompt(hybridResult), systemPrompt),
          grounded: grounding.grounded,
          threshold: groundedMinScore,
          retrievalScore: grounding.retrieval_score,
          sources: hybridResult.sources,
          chunks: hybridResult.results,
          chunkScore: (r) => r.vectorScore,
        })
        systemPrompt = applied.systemPrompt
        ragSources = applied.sources
        ungroundedKeptSources = applied.ungroundedKeptSources
        ungroundedRefused = applied.refused
        if (!applied.refused) {
          vlmResults = hybridResult.results
          console.log(`[V1 API] RAG hybrid: ${hybridResult.results.length} chunks`)
        }
      } else {
        const retrievalResult = await smartRetrieve(userQuery, {
          minSimilarity: 0.30,
          groupIds,
          organizationId: assistant.organizationId ?? undefined,
        })
        grounding = groundingOf(retrievalResult.chunks.map((c) => c.similarity))
        if (retrievalResult.context) {
          const vectorFloor = groundingThreshold()
          const applied = applyGroundingGate({
            systemPrompt,
            formatContext: () => fitContext(formatContextForPrompt(retrievalResult), systemPrompt),
            grounded: grounding.grounded,
            threshold: vectorFloor,
            retrievalScore: grounding.retrieval_score,
            sources: retrievalResult.sources,
            chunks: retrievalResult.chunks,
            chunkScore: (c) => c.similarity,
          })
          systemPrompt = applied.systemPrompt
          ragSources = applied.sources
          ungroundedKeptSources = applied.ungroundedKeptSources
          ungroundedRefused = applied.refused
          if (!applied.refused) {
            vlmResults = retrievalResult.chunks
            console.log(`[V1 API] RAG vector: ${retrievalResult.chunks.length} chunks`)
          }
        }
      }

      // UAT issue 7: give each reference a link the reader can open — the
      // book page the excerpt came from. Minted once for every candidate
      // source (the cited-only selection then keeps only what the answer
      // used); never throws, and is a no-op without AGENT_API_LINK_SECRET.
      if (ragSources.length > 0) {
        await attachPageUrls(ragSources, { organizationId: assistant.organizationId ?? null })
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

  // Resolve tools for the assistant. Models flagged non-tool-capable in the
  // catalog (e.g. small local GGUF models) get NO tools and no tool
  // instructions — sending tools to them yields malformed calls or empty
  // replies instead of text.
  const apiModelInfo = await getModelByIdAsync(modelId)
  const modelSupportsTools = apiModelInfo?.capabilities.functionCalling !== false
  const { tools: resolvedTools, toolNames } = modelSupportsTools
    ? await resolveToolsForAssistant(assistant.id, modelId, {
        userId: syntheticUserId,
        assistantId: assistant.id,
        organizationId: assistant.organizationId ?? undefined,
      })
    : { tools: {}, toolNames: [] as string[] }

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

  // ===== SELECTIVE VLM-AT-ANSWER =====
  // Attach the actual figure crop(s) to the call ONLY when: the feature is on,
  // the model has vision, and a retrieved chunk is a trigger-kind figure (charts
  // by default). Charts carry the answer in pixels; tables/prose stay text-only.
  try {
    const { getRagConfig } = await import("@/lib/rag/config")
    const { vlmAtAnswerEnabled, vlmAtAnswerTypes, vlmAtAnswerMaxImages } = getRagConfig()
    const modelHasVision = (apiModelInfo?.capabilities as { vision?: boolean } | undefined)?.vision === true
    if (vlmAtAnswerEnabled && modelHasVision && vlmResults.length > 0) {
      const { selectVlmFigures, buildFigureParts } = await import("@/lib/rag/vlm-figures")
      const selected = selectVlmFigures(vlmResults, ragSources, {
        types: vlmAtAnswerTypes,
        maxImages: vlmAtAnswerMaxImages,
      })
      const figureParts = await buildFigureParts(selected)
      if (figureParts.length > 0) {
        messages.push({ role: "user", content: figureParts })
        console.log(`[V1 API] VLM-at-answer: attached ${selected.length} figure image(s)`)
      }
    }
  } catch (err) {
    console.warn(`[V1 API] VLM-at-answer skipped: ${err instanceof Error ? err.message.slice(0, 120) : err}`)
  }

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
    // `maxOutputTokens` is the SDK's name for this. It was previously spelled
    // `maxTokens`, which the SDK silently ignores — so a client sending
    // max_tokens got no cap at all, and nothing reserved room for the answer.
    maxOutputTokens: input.max_tokens ?? RESERVED_OUTPUT_TOKENS,
    ...(modelConfig?.temperature != null && input.temperature == null && { temperature: Number(modelConfig.temperature) }),
    ...(modelConfig?.topP != null && input.top_p == null && { topP: Number(modelConfig.topP) }),
    ...(modelConfig?.maxTokens != null && input.max_tokens == null && { maxOutputTokens: Number(modelConfig.maxTokens) }),
  })

  // Opt-in: the images for the answer's `[figure:N]` tags ride the same
  // response. Off by default — it multiplies the payload and nothing in it is
  // cacheable, so only a client that asked for it pays that cost. Remote-marked
  // sources fetch their bytes from rantai-kb's assets route, local ones from
  // this app's S3 (see figureDownloadForRemote).
  //
  // An ungrounded-refused answer gets no figures: sources are [] by design
  // (UAT issue 3), so there is nothing for a `[figure:N]` to resolve to.
  // The feed receives the FULL scored list — `[figure:N]` numbers by
  // position, unchanged by the response's source filtering.
  const figureFeed =
    input.inline_figures && !ungroundedRefused
      ? createInlineFigureFeed(
          ragSources,
          { download: figureDownloadForRemote(downloadFile, remoteAssetDownload) },
          selectedFigureNumbers(vlmResults, ragSources),
        )
      : undefined

  // How the response filters the source list once the answer text exists
  // (UAT issues 4/7). The builders keep the numbers the model saw.
  const sourceSelection: SourceSelection = {
    mode: input.sources,
    grounded: grounding?.grounded ?? false,
    ungroundedKeep: ungroundedKeptSources,
  }

  if (wantStream) {
    return createSSEStreamResponse(result, requestId, modelId, ragSources, figureFeed, grounding, sourceSelection)
  }

  return createJsonResponse(result, requestId, modelId, ragSources, figureFeed, grounding, sourceSelection)
}
