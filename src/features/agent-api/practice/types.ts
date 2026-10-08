import { z } from "zod"

/**
 * Practice sets for the v1 API, in the shape the product spec fixes:
 * three multiple-choice formats, one `materi` title per question, and an
 * answer key plus explanation the client shows after submission.
 */
export const PRACTICE_TYPES = ["mcq_normal", "mcq_multiple_correct", "mcq_story"] as const
export type PracticeType = (typeof PRACTICE_TYPES)[number]

export const PracticeGenerateSchema = z.object({
  topic: z.string().trim().min(1).max(200),
  practice_type: z.enum(PRACTICE_TYPES),
  /** The spec fixes five; fewer is allowed for a quick check. */
  total_questions: z.number().int().min(1).max(10).optional().default(5),
  knowledge_base_ids: z.array(z.string().min(1)).optional(),
})
export type PracticeGenerateInput = z.infer<typeof PracticeGenerateSchema>

const OptionsSchema = z.record(z.string().regex(/^[A-E]$/), z.string())
const LetterSchema = z.string().regex(/^[A-E]$/)

export const PracticeQuestionSchema = z.object({
  question_id: z.string().min(1),
  type: z.enum(["mcq_single", "mcq_multi"]),
  materi: z.string(),
  question: z.string(),
  options: OptionsSchema,
  answer_key: z.union([LetterSchema, z.array(LetterSchema).min(1)]),
  pembahasan: z.string(),
})
export type PracticeQuestion = z.infer<typeof PracticeQuestionSchema>

export const PracticeSetSchema = z.object({
  practice_type: z.enum(PRACTICE_TYPES),
  topic: z.string(),
  story: z.object({ title: z.string(), text: z.string() }).optional(),
  total_questions: z.number().int(),
  materi_titles: z.array(z.string()),
  questions: z.array(PracticeQuestionSchema).min(1),
})
export type PracticeSet = z.infer<typeof PracticeSetSchema>

export const PracticeGradeSchema = z.object({
  practice: PracticeSetSchema,
  /** question_id -> the letter chosen, or the letters for a multi-select. */
  answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
})
export type PracticeGradeInput = z.infer<typeof PracticeGradeSchema>
