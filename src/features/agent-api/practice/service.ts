/**
 * Practice sets on the v1 API: generate from the knowledge base, grade by code.
 *
 * Generation follows the Elise integration spec and its reference mockup
 * (IdhamTryCode/Agents-Mockup): per-topic retrieval and grounding, many small
 * calls to the fine-tuned practice adapter (one passage, at most three
 * questions each), then verification — word checks and an AI checker on the
 * base model — with rejected questions replaced from other passages. Everything
 * the adapter does not emit (question ids, materi, the explanation, the option
 * order) is added here by code.
 *
 * UAT issues 10 and 11: every request now ends in exactly one outcome log
 * line (see ./outcome-log), a client disconnect (the route wires `req.signal`
 * through) stops further adapter calls instead of burning the model, the
 * optional labelling model fails fast behind a circuit breaker and is never
 * on the critical path longer than 15 s, `stream: true` returns an SSE with
 * live progress, and a failed generation says why — rejection counts and
 * adapter timeouts/errors travel in `error.details` with the code unchanged.
 */
import { prisma } from "@/lib/prisma"
import { retrieveForGroups } from "../kb-retrieval"
import { generateText } from "ai"
import { getChatProvider, resolveModelId } from "@/lib/llm/provider"
import { resolveRequestedGroupIds } from "../service"
import { listMapelForAssistant, resolveMapel } from "../mapel"
import { groundingOf } from "../grounding"
import { aiCheck } from "./checker"
import { chatJson, resolveEndpoint } from "./client"
import { buildPracticeSet, type Passage, type TopicMaterial } from "./engine"
import { explain } from "./explain"
import {
  adapterMaxTokens, adapterSchema, adapterSystem, adapterUserMessage, parseAdapterReply, toPracticeQuestion,
} from "./generate-contract"
import { gradePractice } from "./grade"
import { isBreakerError, labelBreakerClosedNotice, labelBreakerOpen, openLabelBreaker } from "./label-breaker"
import { labelPrompt, parseMateriLabels } from "./materi-labels"
import { emptyRejections, logPracticeOutcome, markOutcomeLogged, type PracticeOutcome } from "./outcome-log"
import { passagesForPractice } from "./passages"
import { requestedTopics, type PracticeGenerateInput, type PracticeGradeInput, type PracticeSet } from "./types"

const JSON_HEADERS = { "Content-Type": "application/json" }
/** Retrieved prose chunks kept per topic as candidate passages. */
const MAX_PASSAGES_PER_TOPIC = 8
const MIN_CHUNK_CHARS = 120
/** Per adapter call. A healthy call takes ~12 s; story calls that degenerate run to this. */
const ADAPTER_TIMEOUT_MS = 120_000
/** Temperature of the blind tests the measured quality was taken at. */
const ADAPTER_TEMPERATURE = 0.1
/** Total budget for the labelling model, retries included (issue 11). */
const LABEL_TOTAL_MS = 15_000
/** SSE comment heartbeat so proxies do not cut an idle connection (issue 10). */
const SSE_HEARTBEAT_MS = 10_000

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
}

/** The wording the product spec fixes for a topic the books do not cover. */
export const NOT_IN_BOOKS = "I don't know based on the available books."

/** What the route hands the generator: the client's signal and stream flag. */
export interface PracticeGenerateOpts {
  signal?: AbortSignal
  stream?: boolean
}

/** Live progress over SSE (issue 10); the stages the client is told about. */
export interface PracticeProgressEvent {
  stage: "retrieval" | "generating" | "checking" | "labelling"
  delivered: number
  total: number
  adapter_calls: number
  elapsed_s: number
}

function fail(status: number, message: string, type: string, code: string, details?: unknown): Response {
  const error = details === undefined ? { message, type, code } : { message, type, code, details }
  return new Response(JSON.stringify({ error }), { status, headers: JSON_HEADERS })
}

export function practiceModel(env: Record<string, string | undefined> = process.env): string {
  return env.AGENT_API_PRACTICE_MODEL?.trim() || "practice"
}

/** The base model that answers each question without the key. "off" disables the AI checker. */
export function checkerModel(env: Record<string, string | undefined> = process.env): string | null {
  const v = env.AGENT_API_PRACTICE_CHECKER_MODEL?.trim()
  if (v?.toLowerCase() === "off") return null
  return v || "base"
}

/**
 * The grade for the generation prompt when the request does not send one: the
 * single "Kelas N" across the assistant's knowledge bases, else null (the
 * prompt then defaults to 8, as the adapter's training data mostly is).
 */
export function gradeFromGroupNames(names: string[]): number | null {
  const grades = new Set<number>()
  for (const n of names) {
    const m = n.match(/\bkelas\s+(\d{1,2})\b/i)
    if (m) grades.add(Number(m[1]))
  }
  return grades.size === 1 ? [...grades][0] : null
}

/**
 * Materi titles from the optional labelling model; null when unset, unusable,
 * or skipped by the circuit breaker.
 *
 * Fails fast (issue 11): the SDK retries nothing (`maxRetries: 0`), a thrown
 * error is NOT retried and opens the breaker when it smells of quota or
 * auth, and only an unusable reply earns one second attempt — inside a
 * single 15 s budget for the whole step, so a broken label model can never
 * sit on the request's critical path longer than that.
 */
async function materiLabels(questions: string[], topic: string, signal?: AbortSignal): Promise<string[] | null> {
  const model = process.env.AGENT_API_PRACTICE_LABEL_MODEL?.trim()
  if (!model) return null
  if (labelBreakerOpen()) return null
  labelBreakerClosedNotice()
  if (signal?.aborted) return null
  const deadline = Date.now() + LABEL_TOTAL_MS
  for (let attempt = 1; attempt <= 2; attempt++) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) return null
    let text: string
    try {
      const { text: reply } = await generateText({
        model: getChatProvider()(resolveModelId(model)),
        prompt: labelPrompt(questions, topic),
        // Room for a reasoning model to think and still answer; the reply itself
        // is under a hundred tokens.
        maxOutputTokens: 4000,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(remaining),
      })
      text = reply
    } catch (err) {
      const message = (err as Error)?.message ?? String(err)
      console.warn(`[V1 Practice] materi labels failed: ${message.slice(0, 120)}`)
      if (isBreakerError(message)) openLabelBreaker(message)
      return null
    }
    const labels = parseMateriLabels(text, questions.length)
    if (labels) return labels
    console.warn(`[V1 Practice] materi labels: unusable reply (attempt ${attempt})`)
  }
  return null
}

/**
 * Prose passages for one topic, or null when the books do not cover it.
 * Figures carry a caption, not material, and a set built on nothing retrieved
 * would come from the model's memory rather than the curriculum.
 */
async function topicMaterial(
  topic: string,
  scope: { groupIds: string[]; organizationId: string | null },
): Promise<TopicMaterial | null> {
  // Retrieval goes through the same per-KB router as chat: a knowledge base
  // the route table switched is served by rantai-kb (with the route's
  // grounding threshold), everything else by the in-process engine as before.
  const { result: retrieved, groundedMinScore } = await retrieveForGroups(topic, {
    groupIds: scope.groupIds,
    organizationId: scope.organizationId ?? undefined,
  })
  const prose = retrieved.results.filter((r) => r.chunkType !== "figure" && r.content.trim().length >= MIN_CHUNK_CHARS)
  // The same threshold the chat path reports `grounded` with, so one
  // calibration (AGENT_API_GROUNDED_MIN_SCORE, or the route table's
  // groundedMinScore for a switched KB) governs both.
  if (prose.length === 0 || !groundingOf(prose.map((r) => r.vectorScore), groundedMinScore).grounded) return null
  const raw: Passage[] = prose.slice(0, MAX_PASSAGES_PER_TOPIC).map((r) => ({
    title: r.documentTitle ?? "Buku",
    section: r.section ?? null,
    text: r.content.trim(),
  }))
  return { topic, passages: passagesForPractice(raw) }
}

/** What the shared generator resolves to: the 200 body, or an error the JSON path returns. */
type GenOutcome =
  | { ok: true; body: string }
  | { ok: false; status: number; message: string; type: string; code: string; details?: unknown }

/** Per-request counters for the outcome line, gathered as the stages complete. */
interface StageStats {
  delivered: number
  adapterCalls: number
  checks: number
  rejected: ReturnType<typeof emptyRejections>
  skipped: number
  retrievalMs: number
  generateMs: number
  labelMs: number
  aborted: boolean
}

/**
 * One generation, start to outcome line — shared by the JSON and the SSE
 * path, so `event: result` carries exactly the body the JSON path returns.
 * Logs one outcome line on every exit; a thrown error is logged (status 500)
 * and rethrown marked, so the route's catch does not log a second line.
 */
async function generatePracticeSet(
  auth: { apiKey: { assistantId: string } },
  input: PracticeGenerateInput,
  opts: PracticeGenerateOpts & { onProgress?: (e: PracticeProgressEvent) => void } = {},
): Promise<GenOutcome> {
  const started = Date.now()
  const topics = requestedTopics(input)
  const st: StageStats = {
    delivered: 0, adapterCalls: 0, checks: 0, rejected: emptyRejections(),
    skipped: 0, retrievalMs: 0, generateMs: 0, labelMs: 0, aborted: false,
  }
  const elapsedS = () => Math.round((Date.now() - started) / 100) / 10
  const emit = (e: Omit<PracticeProgressEvent, "total" | "elapsed_s">) =>
    opts.onProgress?.({ ...e, total: input.total_questions, elapsed_s: elapsedS() })
  /** Log the outcome line and hand back the matching error result. */
  const exit = (
    status: number,
    message: string,
    type: string,
    code: string,
    details?: unknown,
  ): GenOutcome => {
    logPracticeOutcome({
      status, code, requested: input.total_questions, delivered: st.delivered,
      adapterCalls: st.adapterCalls, checks: st.checks, rejected: st.rejected,
      topics: topics.length, skipped: st.skipped, type: input.practice_type,
      verify: input.verify, stream: opts.stream ?? false, ms: Date.now() - started,
      retrievalMs: st.retrievalMs, generateMs: st.generateMs, labelMs: st.labelMs,
      aborted: st.aborted || (opts.signal?.aborted ?? false),
    })
    return { ok: false, status, message, type, code, ...(details === undefined ? {} : { details }) }
  }

  try {
    const assistant = await prisma.assistant.findUnique({
      where: { id: auth.apiKey.assistantId },
      select: { organizationId: true, knowledgeBaseGroupIds: true },
    })
    if (!assistant) return exit(404, "Assistant not found", "not_found_error", "assistant_not_found")

    // A subject narrows generation to one knowledge base of the assistant's
    // grade. Sending both a subject and explicit ids is ambiguous, so it is
    // refused rather than resolved by precedence.
    if (input.mapel && input.knowledge_base_ids?.length) {
      return exit(400, "Send either mapel or knowledge_base_ids, not both.", "invalid_request_error", "invalid_knowledge_base")
    }
    let requestedGroupIds = input.knowledge_base_ids
    if (input.mapel) {
      const available = await listMapelForAssistant(assistant)
      const picked = resolveMapel(available, input.mapel)
      if ("error" in picked) {
        return exit(400, `${picked.error} Available: ${picked.available.join(", ")}`, "invalid_request_error", "unknown_mapel")
      }
      requestedGroupIds = picked.ids
    }

    const resolved = await resolveRequestedGroupIds(
      assistant.organizationId,
      assistant.knowledgeBaseGroupIds,
      requestedGroupIds,
    )
    if ("error" in resolved) return exit(400, resolved.error, "invalid_request_error", "invalid_knowledge_base")
    if (!resolved.ids?.length) {
      return exit(422, "This assistant has no knowledge base to generate practice from.", "invalid_request_error", "no_knowledge_base")
    }
    const groupIds = resolved.ids

    const practiceEndpoint = await resolveEndpoint(practiceModel())
    if (!practiceEndpoint) {
      return exit(503, `Practice generation is not configured: no provider serves the model "${practiceModel()}".`, "server_error", "practice_model_unavailable")
    }
    const checker = input.verify ? checkerModel() : null
    const checkerEndpoint = checker ? await resolveEndpoint(checker) : null
    if (checker && !checkerEndpoint) {
      console.warn(`[V1 Practice] AI checker skipped: no provider serves the model "${checker}"`)
    }

    // Grounding per topic: a topic the books do not cover is skipped and listed;
    // the request fails only when every topic does.
    emit({ stage: "retrieval", delivered: 0, adapter_calls: 0 })
    const retrievalStart = Date.now()
    const materials = await Promise.all(
      topics.map((t) => topicMaterial(t, { groupIds, organizationId: assistant.organizationId })),
    )
    st.retrievalMs = Date.now() - retrievalStart
    const covered = materials.filter((m): m is TopicMaterial => m !== null && m.passages.length > 0)
    st.skipped = topics.filter((_, i) => !materials[i] || materials[i]!.passages.length === 0).length
    if (covered.length === 0) return exit(422, NOT_IN_BOOKS, "not_grounded", "topic_not_in_books")
    if (opts.signal?.aborted) return exit(499, "Client disconnected during generation.", "request_error", "client_disconnected")

    let grade = input.grade ?? null
    if (grade === null) {
      const groups = await prisma.knowledgeBaseGroup.findMany({ where: { id: { in: groupIds } }, select: { name: true } })
      grade = gradeFromGroupNames(groups.map((g) => g.name))
    }
    const system = adapterSystem(grade)

    const generateStart = Date.now()
    const result = await buildPracticeSet(
      {
        topics: covered,
        count: input.total_questions,
        type: input.practice_type,
        verify: input.verify,
        signal: opts.signal,
        onProgress: opts.onProgress
          ? (info) => opts.onProgress!({
              stage: info.stage,
              delivered: info.delivered,
              total: input.total_questions,
              adapter_calls: info.adapter_calls,
              elapsed_s: elapsedS(),
            })
          : undefined,
      },
      {
        generate: async (tipe, n, passage, signal) => {
          const reply = await chatJson(
            practiceEndpoint,
            [{ role: "system", content: system }, { role: "user", content: adapterUserMessage(tipe, n, passage) }],
            {
              temperature: ADAPTER_TEMPERATURE,
              maxTokens: adapterMaxTokens(n),
              schemaName: "soal",
              schema: adapterSchema(tipe, n),
              timeoutMs: ADAPTER_TIMEOUT_MS,
              signal,
            },
          )
          if (!reply.ok) return reply.failure === "timeout" ? { failure: "timeout" } : { failure: "error" }
          return parseAdapterReply(reply.text, tipe)
        },
        check: checkerEndpoint
          ? (s, passage) =>
              aiCheck(async (m, o) => {
                const reply = await chatJson(checkerEndpoint, m, { ...o, signal: opts.signal })
                return reply.ok ? reply.text : null
              }, s, passage)
          : null,
      },
    )
    st.generateMs = Date.now() - generateStart
    st.delivered = result.questions.length
    st.adapterCalls = result.adapterCalls
    st.checks = result.checksRun
    st.rejected = result.rejected

    // Rejected questions stay out of the response; they go to the logs for review.
    for (const r of result.rejectedExamples) {
      console.info(`[V1 Practice] rejected (${r.reason}): ${r.detail} | ${r.question.slice(0, 160)} | key ${r.key.slice(0, 120)}`)
    }

    if (result.aborted) {
      st.aborted = true
      return exit(499, "Client disconnected during generation.", "request_error", "client_disconnected")
    }

    if (result.questions.length === 0) {
      // Issue 11: say why the set is empty when the engine knows, and put
      // the numbers in `details` — the code stays generation_failed.
      const rejectedTotal = Object.values(result.rejected).reduce((a, b) => a + b, 0)
      const counts = Object.entries(result.rejected).filter(([, n]) => n > 0).map(([r, n]) => `${r} ${n}`).join(", ")
      let message: string
      if (rejectedTotal > 0 && result.adapterTimeouts > 0) {
        message = `Every generated question failed verification (${counts}); ${result.adapterTimeouts} adapter call(s) timed out. Try again.`
      } else if (rejectedTotal > 0) {
        message = `Every generated question failed verification (${counts}). Try again.`
      } else if (result.adapterTimeouts > 0 && result.adapterErrors === 0) {
        message = "The practice model did not answer in time. Try again."
      } else if (result.adapterTimeouts > 0 || result.adapterErrors > 0) {
        message = `The practice model could not be reached (${result.adapterTimeouts} timeout(s), ${result.adapterErrors} error(s)). Try again.`
      } else {
        message = "The practice model did not return a usable set. Try again."
      }
      return exit(502, message, "server_error", "generation_failed", {
        rejected: result.rejected,
        adapter_calls: result.adapterCalls,
        adapter_timeouts: result.adapterTimeouts,
        adapter_errors: result.adapterErrors,
      })
    }

    const topicLabel = covered.map((m) => m.topic).join(", ")
    emit({ stage: "labelling", delivered: result.questions.length, adapter_calls: result.adapterCalls })
    const labelStart = Date.now()
    const labels = await materiLabels(result.questions.map((s) => s.pertanyaan), topicLabel, opts.signal)
    st.labelMs = Date.now() - labelStart
    const questions = result.questions.map((s, i) => {
      // The explanation quotes the passage this question was written from.
      const derived = explain(s, [s.passage], s.topic)
      return toPracticeQuestion(s, i, s.tipe === "multi", {
        materi: labels?.[i] ?? derived.materi,
        pembahasan: derived.pembahasan,
        topic: s.topic,
      })
    })

    const set: PracticeSet = {
      practice_type: input.practice_type,
      topic: topicLabel,
      topics: covered.map((m) => m.topic),
      total_questions: questions.length,
      materi_titles: [...new Set(questions.map((q) => q.materi))],
      questions,
      report: {
        requested: input.total_questions,
        delivered: questions.length,
        adapter_calls: result.adapterCalls,
        checks_run: result.checksRun,
        seconds: Math.round((Date.now() - started) / 100) / 10,
        rejected: result.rejected,
        skipped_topics: topics.filter((_, i) => !materials[i] || materials[i]!.passages.length === 0),
      },
    }
    const body = JSON.stringify(set)
    logPracticeOutcome({
      status: 200, code: "ok", requested: input.total_questions, delivered: questions.length,
      adapterCalls: result.adapterCalls, checks: result.checksRun, rejected: result.rejected,
      topics: topics.length, skipped: st.skipped, type: input.practice_type,
      verify: input.verify, stream: opts.stream ?? false, ms: Date.now() - started,
      retrievalMs: st.retrievalMs, generateMs: st.generateMs, labelMs: st.labelMs,
      aborted: false,
    } satisfies PracticeOutcome)
    return { ok: true, body }
  } catch (err) {
    // Unexpected: log the request's outcome with the stages it did reach,
    // then rethrow (marked) — the route answers with today's 500 shape.
    logPracticeOutcome({
      status: 500, code: "internal_error", requested: input.total_questions, delivered: st.delivered,
      adapterCalls: st.adapterCalls, checks: st.checks, rejected: st.rejected,
      topics: topics.length, skipped: st.skipped, type: input.practice_type,
      verify: input.verify, stream: opts.stream ?? false, ms: Date.now() - started,
      retrievalMs: st.retrievalMs, generateMs: st.generateMs, labelMs: st.labelMs,
      aborted: opts.signal?.aborted ?? false,
    })
    markOutcomeLogged(err)
    throw err
  }
}

export async function runPracticeGenerate(
  auth: { apiKey: { assistantId: string } },
  input: PracticeGenerateInput,
  opts: PracticeGenerateOpts = {},
): Promise<Response> {
  if (opts.stream) {
    // Issue 10: text/event-stream with progress events, one result event
    // carrying the exact JSON body of the non-stream path, and error events
    // for every failure the JSON path would answer. The heartbeat keeps
    // proxies from cutting an idle connection; the client's signal closes
    // the stream the moment the client is gone.
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        let closed = false
        const write = (chunk: string) => {
          if (closed) return
          try {
            controller.enqueue(encoder.encode(chunk))
          } catch {
            closed = true
          }
        }
        const send = (event: string, data: unknown) =>
          write(`event: ${event}\ndata: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`)
        const heartbeat = setInterval(() => write(": ping\n\n"), SSE_HEARTBEAT_MS)
        const finish = () => {
          if (closed) return
          closed = true
          clearInterval(heartbeat)
          try {
            controller.close()
          } catch {
            // already closed by the other side
          }
        }
        opts.signal?.addEventListener("abort", finish, { once: true })
        generatePracticeSet(auth, input, { ...opts, stream: true, onProgress: (e) => send("progress", e) })
          .then((outcome) => {
            if (closed) return
            if (outcome.ok) send("result", outcome.body)
            else send("error", { error: { message: outcome.message, type: outcome.type, code: outcome.code }, status: outcome.status })
          })
          .catch(() => {
            // generatePracticeSet already logged the outcome line.
            if (!closed) send("error", { error: { message: "Internal server error", type: "server_error", code: "internal_error" }, status: 500 })
          })
          .finally(finish)
      },
    })
    return new Response(stream, { status: 200, headers: SSE_HEADERS })
  }

  const outcome = await generatePracticeSet(auth, input, opts)
  if (outcome.ok) return new Response(outcome.body, { status: 200, headers: JSON_HEADERS })
  // 499 client_disconnected arrives with no details; the client is gone and
  // this response exists so the route has its usual shape to return.
  return fail(outcome.status, outcome.message, outcome.type, outcome.code, outcome.details)
}

export function runPracticeGrade(input: PracticeGradeInput): Response {
  return new Response(JSON.stringify(gradePractice(input.practice, input.answers)), { status: 200, headers: JSON_HEADERS })
}
