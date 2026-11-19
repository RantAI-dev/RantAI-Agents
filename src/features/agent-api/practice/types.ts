import { z } from "zod"

/**
 * Practice sets for the v1 API: multiple-choice formats, one `materi` title per
 * question, and an answer key plus explanation the client shows after
 * submission.
 *
 * `mcq_mixed` assembles a set from the other three (40% normal, 30% multiple
 * correct, 30% story). Story questions carry their own short `scenario`, one per
 * question, as the practice adapter was trained to write them.
 */
export const PRACTICE_TYPES = ["mcq_normal", "mcq_multiple_correct", "mcq_story", "mcq_mixed"] as const
export type PracticeType = (typeof PRACTICE_TYPES)[number]

export const MAX_PRACTICE_QUESTIONS = 20

const TopicSchema = z.string().trim().min(1).max(200)

export const PracticeGenerateSchema = z
  .object({
    /** One topic. Still accepted; treated as `topics: [topic]`. */
    topic: TopicSchema.optional(),
    /** One or more topics. Required unless `topic` is sent. */
    topics: z.array(TopicSchema).min(1).max(MAX_PRACTICE_QUESTIONS).optional(),
    practice_type: z.enum(PRACTICE_TYPES),
    total_questions: z.number().int().min(1).max(MAX_PRACTICE_QUESTIONS).optional().default(5),
    /** Run the verification checks. False only for comparison tests. */
    verify: z.boolean().optional().default(true),
    /**
     * Stream progress over SSE while the set is generated (issue 10): the
     * route answers `text/event-stream` with `progress` events (stage,
     * delivered/total, adapter calls, elapsed seconds) ending in one `result`
     * event carrying exactly the JSON body the non-stream path returns.
     * Default false: the plain JSON response, unchanged.
     */
    stream: z.boolean().optional().default(false),
    /**
     * School grade (1–12) for the generation prompt. Optional: when absent it is
     * read from the assistant's knowledge-base names ("SMP Kelas 8"), else 8.
     */
    grade: z.number().int().min(1).max(12).optional(),
    knowledge_base_ids: z.array(z.string().min(1)).optional(),
    /**
     * Restrict generation to one subject of the assistant's grade, e.g. "IPA".
     * List the valid values with GET /api/v1/mapel. Cannot be combined with
     * `knowledge_base_ids`.
     */
    mapel: z.string().trim().min(1).max(100).optional(),
  })
  .refine((v) => Boolean(v.topic) || Boolean(v.topics?.length), {
    message: "Send `topics` (one or more) or `topic`.",
    path: ["topics"],
  })
export type PracticeGenerateInput = z.infer<typeof PracticeGenerateSchema>

/** The topics a request asks for, de-duplicated, `topics` first. */
export function requestedTopics(input: Pick<PracticeGenerateInput, "topic" | "topics">): string[] {
  const all = [...(input.topics ?? []), ...(input.topic ? [input.topic] : [])]
  const seen = new Set<string>()
  return all.filter((t) => {
    const k = t.trim().toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

const OptionsSchema = z.record(z.string().regex(/^[A-E]$/), z.string())
const LetterSchema = z.string().regex(/^[A-E]$/)

export const PracticeQuestionSchema = z.object({
  question_id: z.string().min(1),
  type: z.enum(["mcq_single", "mcq_multi"]),
  materi: z.string(),
  question: z.string(),
  /** The story for this question; present only on story questions. */
  scenario: z.string().optional(),
  options: OptionsSchema,
  answer_key: z.union([LetterSchema, z.array(LetterSchema).min(1)]),
  pembahasan: z.string(),
  /** Which requested topic the question belongs to. */
  topic: z.string().optional(),
})
export type PracticeQuestion = z.infer<typeof PracticeQuestionSchema>

export const REJECTION_REASONS = [
  "format", "key_unsupported", "twin_keys", "ambiguous", "ai_checker", "duplicate",
] as const
export type RejectionReason = (typeof REJECTION_REASONS)[number]

export const PracticeReportSchema = z.object({
  requested: z.number().int(),
  delivered: z.number().int(),
  adapter_calls: z.number().int(),
  checks_run: z.number().int(),
  seconds: z.number(),
  rejected: z.record(z.enum(REJECTION_REASONS), z.number().int()),
  skipped_topics: z.array(z.string()),
})
export type PracticeReport = z.infer<typeof PracticeReportSchema>

export const PracticeSetSchema = z.object({
  practice_type: z.enum(PRACTICE_TYPES),
  topic: z.string(),
  topics: z.array(z.string()).optional(),
  /** Legacy shared-story sets only; new sets put a scenario on each story question. */
  story: z.object({ title: z.string(), text: z.string() }).optional(),
  total_questions: z.number().int(),
  materi_titles: z.array(z.string()),
  questions: z.array(PracticeQuestionSchema).min(1),
  report: PracticeReportSchema.optional(),
})
export type PracticeSet = z.infer<typeof PracticeSetSchema>

export const PracticeGradeSchema = z.object({
  practice: PracticeSetSchema,
  /** question_id -> the letter chosen, or the letters for a multi-select. */
  answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
})
export type PracticeGradeInput = z.infer<typeof PracticeGradeSchema>
