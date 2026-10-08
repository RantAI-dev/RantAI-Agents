/**
 * Practice sets on the v1 API: generate from the knowledge base, grade by code.
 *
 * Generation calls the deployment's fine-tuned practice adapter directly on its
 * OpenAI-compatible endpoint, because the request needs `response_format:
 * json_schema` and the chat path has no way to pass it. Everything the adapter
 * does not emit — question ids, the materi title, the explanation, the option
 * order — is added here by code.
 */
import { prisma } from "@/lib/prisma"
import { smartHybridRetrieve } from "@/lib/rag"
import { generateText } from "ai"
import { getChatProvider, resolveModelId } from "@/lib/llm/provider"
import { ensureProviderRegistryLoaded, getProviderRegistry } from "@/lib/llm/provider-registry"
import { resolveRequestedGroupIds } from "../service"
import {
  TIPE_FOR, adapterSchema, adapterUserMessage, parseAdapterReply, shuffleOptions, toPracticeQuestion,
  type AdapterSoal, type AdapterTipe,
} from "./generate-contract"
import { explain, type Excerpt } from "./explain"
import { gradePractice } from "./grade"
import { groundingOf } from "../grounding"
import { labelPrompt, parseMateriLabels } from "./materi-labels"
import type { PracticeGenerateInput, PracticeGradeInput, PracticeSet } from "./types"

const JSON_HEADERS = { "Content-Type": "application/json" }
const MAX_EXCERPTS = 6
const MAX_EXCERPT_CHARS = 1500
const UPSTREAM_TIMEOUT_MS = 150_000

/** The wording the product spec fixes for a topic the books do not cover. */
export const NOT_IN_BOOKS = "I don't know based on the available books."

function fail(status: number, message: string, type: string, code: string): Response {
  return new Response(JSON.stringify({ error: { message, type, code } }), { status, headers: JSON_HEADERS })
}

function practiceModel(): string {
  return process.env.AGENT_API_PRACTICE_MODEL?.trim() || "practice"
}

function extraBody(): Record<string, unknown> {
  // Only the template switches apply to a non-streaming call; stream_options
  // alongside stream:false is rejected by vLLM.
  try {
    const parsed = JSON.parse(process.env.LLM_EXTRA_BODY || "{}")
    const kwargs = parsed?.chat_template_kwargs
    return kwargs && typeof kwargs === "object" ? { chat_template_kwargs: kwargs } : {}
  } catch {
    return {}
  }
}

async function callAdapter(
  endpoint: { baseUrl: string; apiKey: string | null; model: string },
  system: string,
  tipe: AdapterTipe,
  jumlah: number,
  topic: string,
): Promise<AdapterSoal[] | null> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), UPSTREAM_TIMEOUT_MS)
  try {
    const res = await fetch(`${endpoint.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: { ...JSON_HEADERS, ...(endpoint.apiKey ? { Authorization: `Bearer ${endpoint.apiKey}` } : {}) },
      signal: ctl.signal,
      body: JSON.stringify({
        model: endpoint.model,
        temperature: 0.3,
        // Scaled to the request: a fixed ceiling truncated ten-question sets.
        max_tokens: Math.min(3600, 400 + jumlah * (tipe === "cerita" ? 340 : 240)),
        messages: [
          { role: "system", content: system },
          { role: "user", content: adapterUserMessage(tipe, jumlah, topic) },
        ],
        response_format: { type: "json_schema", json_schema: { name: "soal", schema: adapterSchema(tipe, jumlah) } },
        ...extraBody(),
      }),
    })
    if (!res.ok) {
      console.warn(`[V1 Practice] ${endpoint.model} returned ${res.status}`)
      return null
    }
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    return parseAdapterReply(body.choices?.[0]?.message?.content ?? "", tipe, jumlah)
  } catch (err) {
    console.warn(`[V1 Practice] call failed: ${(err as Error).message?.slice(0, 120)}`)
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** One retry: a looping or truncated reply is usually gone on the second draw. */
async function generate(...args: Parameters<typeof callAdapter>): Promise<AdapterSoal[] | null> {
  return (await callAdapter(...args)) ?? (await callAdapter(...args))
}

/** Materi titles from the optional labelling model; null when unset or unusable. */
async function materiLabels(questions: string[], topic: string): Promise<string[] | null> {
  const model = process.env.AGENT_API_PRACTICE_LABEL_MODEL?.trim()
  if (!model) return null
  try {
    const { text } = await generateText({
      model: getChatProvider()(resolveModelId(model)),
      prompt: labelPrompt(questions, topic),
      // Room for a reasoning model to think and still answer; the reply itself
      // is under a hundred tokens.
      maxOutputTokens: 4000,
      abortSignal: AbortSignal.timeout(40_000),
    })
    const labels = parseMateriLabels(text, questions.length)
    if (!labels) console.warn("[V1 Practice] materi labels: unusable reply, using derived titles")
    return labels
  } catch (err) {
    console.warn(`[V1 Practice] materi labels skipped: ${(err as Error).message?.slice(0, 120)}`)
    return null
  }
}

function excerptBlock(excerpts: Excerpt[]): string {
  return excerpts
    .map((e, i) => `[${i + 1}] ${e.title}${e.section && e.section !== "None" ? ` — ${e.section}` : ""}\n${e.text}`)
    .join("\n\n")
}

export async function runPracticeGenerate(
  auth: { apiKey: { assistantId: string } },
  input: PracticeGenerateInput,
): Promise<Response> {
  const assistant = await prisma.assistant.findUnique({
    where: { id: auth.apiKey.assistantId },
    select: { organizationId: true, systemPrompt: true, knowledgeBaseGroupIds: true },
  })
  if (!assistant) return fail(404, "Assistant not found", "not_found_error", "assistant_not_found")

  const resolved = await resolveRequestedGroupIds(
    assistant.organizationId,
    assistant.knowledgeBaseGroupIds,
    input.knowledge_base_ids,
  )
  if ("error" in resolved) return fail(400, resolved.error, "invalid_request_error", "invalid_knowledge_base")
  if (!resolved.ids?.length) {
    return fail(422, "This assistant has no knowledge base to generate practice from.", "invalid_request_error", "no_knowledge_base")
  }

  // Questions are written only from book prose. Figures carry a caption, not
  // material, and a set built on nothing retrieved would come from the model's
  // memory rather than the curriculum.
  const retrieved = await smartHybridRetrieve(input.topic, { enableEntitySearch: true, groupIds: resolved.ids })
  const prose = retrieved.results.filter((r) => r.chunkType !== "figure" && r.content.trim().length >= 120)
  // The same threshold the chat path reports `grounded` with, so one
  // calibration (AGENT_API_GROUNDED_MIN_SCORE) governs both.
  if (prose.length === 0 || !groundingOf(prose.map((r) => r.vectorScore)).grounded) {
    return fail(422, NOT_IN_BOOKS, "not_grounded", "topic_not_in_books")
  }
  const excerpts: Excerpt[] = prose.slice(0, MAX_EXCERPTS).map((r) => ({
    title: r.documentTitle ?? "Buku",
    section: r.section ?? null,
    text: r.content.trim().slice(0, MAX_EXCERPT_CHARS),
  }))

  await ensureProviderRegistryLoaded()
  const registry = getProviderRegistry()
  const model = practiceModel()
  const provider = registry.providers.get(registry.modelProvider.get(model) ?? "")
  if (!provider?.baseUrl) {
    return fail(503, `Practice generation is not configured: no provider serves the model "${model}".`, "server_error", "practice_model_unavailable")
  }
  const endpoint = { baseUrl: provider.baseUrl, apiKey: provider.apiKey, model }

  const persona = assistant.systemPrompt?.trim() || "Kamu adalah asisten belajar. Buat soal HANYA dari materi buku."
  const system = `${persona}\n\n${excerptBlock(excerpts)}`
  const tipe = TIPE_FOR[input.practice_type]
  const n = input.total_questions

  let soal: AdapterSoal[] | null
  let story: PracticeSet["story"]
  if (tipe === "cerita") {
    // The adapter writes one scenario per question; the spec wants one story
    // shared by all of them. So the first call supplies the story and its first
    // question, and the rest are single-answer questions written against that
    // story, which is appended to the material they may draw on.
    const first = await generate(endpoint, system, "cerita", 1, input.topic)
    if (!first) return fail(502, "The practice model did not return a usable set. Try again.", "server_error", "generation_failed")
    const text = first[0].skenario!
    story = { title: `Cerita: ${input.topic}`, text }
    soal = first
    if (n > 1) {
      const withStory = `${system}\n\nCERITA (semua soal harus tentang cerita ini):\n${text}`
      const rest = await generate(endpoint, withStory, "tunggal", n - 1, `${input.topic} berdasarkan cerita`)
      if (!rest) return fail(502, "The practice model did not return a usable set. Try again.", "server_error", "generation_failed")
      soal = [...first, ...rest]
    }
  } else {
    soal = await generate(endpoint, system, tipe, n, input.topic)
    if (!soal) return fail(502, "The practice model did not return a usable set. Try again.", "server_error", "generation_failed")
  }

  const multi = tipe === "multi"
  const shuffled = soal.map((raw) => shuffleOptions(raw))
  const labels = await materiLabels(shuffled.map((s) => s.pertanyaan), input.topic)
  const questions = shuffled.map((s, i) => {
    const derived = explain(s, excerpts, input.topic)
    return toPracticeQuestion(s, i, multi, { ...derived, materi: labels?.[i] ?? derived.materi })
  })

  const set: PracticeSet = {
    practice_type: input.practice_type,
    topic: input.topic,
    ...(story ? { story } : {}),
    total_questions: questions.length,
    materi_titles: [...new Set(questions.map((q) => q.materi))],
    questions,
  }
  return new Response(JSON.stringify(set), { status: 200, headers: JSON_HEADERS })
}

export function runPracticeGrade(input: PracticeGradeInput): Response {
  return new Response(JSON.stringify(gradePractice(input.practice, input.answers)), { status: 200, headers: JSON_HEADERS })
}
