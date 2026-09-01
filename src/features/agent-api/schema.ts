import { z } from "zod"

export const V1ChatCompletionSchema = z.object({
  model: z.string().optional(),
  messages: z.array(
    z.object({
      role: z.enum(["system", "user", "assistant"]),
      content: z.string(),
    })
  ).min(1),
  stream: z.boolean().optional().default(false),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional(),
  top_p: z.number().min(0).max(1).optional(),
  thread_id: z.string().optional(),
  /**
   * Which knowledge bases this request may read.
   *
   * Omit it and the assistant answers from the set it was configured with —
   * the previous and still the default behaviour. Supply ids to narrow to one
   * subject ("only Matematika Kelas 7"), or `["*"]` to widen to every knowledge
   * base the API key's organisation owns. The narrow case is the point: a
   * question asked inside a maths lesson should not be answered out of the
   * biology book merely because the words overlap.
   *
   * Ids are always intersected with what the key's organisation owns, so this
   * can widen a request within that organisation but never outside it.
   */
  knowledge_base_ids: z.array(z.string().min(1)).optional(),
})

export type V1ChatCompletionInput = z.infer<typeof V1ChatCompletionSchema>
