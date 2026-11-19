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
  /**
   * Restrict retrieval to one subject of the assistant's grade, e.g. "IPA".
   *
   * The grade is fixed by the API key, so only the subject is sent. List the
   * valid values with GET /api/v1/mapel; the values are matched ignoring case
   * and extra whitespace. Cannot be combined with `knowledge_base_ids`.
   */
  mapel: z.string().trim().min(1).max(100).optional(),
  /**
   * Send the images an answer cites in the same response.
   *
   * An answer points at a book figure with `[figure:N]`. By default the client
   * resolves that itself from `sources[N-1]`. With this set, each cited image
   * arrives downscaled and base64-encoded: on a stream, as a `figure` frame
   * right after the text that completes the tag; otherwise in a top-level
   * `figures` array. Only cited figures are sent, and at most a handful per
   * answer.
   */
  inline_figures: z.boolean().optional(),
  /**
   * Which retrieved sources accompany the answer.
   *
   * "cited" (default): only the sources the answer actually cited with `[n]`
   * and that pass the relevance floor — a client rendering reference cards
   * shows only references a reader can check against the text (UAT issue 7:
   * a listed-but-uncited reference and an uncheckable one were the same bug).
   * "all": every source that passed the floor, each still flagged with
   * `cited`. A grounded answer that cites nothing returns the single best
   * source, `cited: false`, so the client always has one verifiable card.
   * An ungrounded answer returns `sources: []` either way (issue 3).
   */
  sources: z.enum(["cited", "all"]).optional().default("cited"),
})

export type V1ChatCompletionInput = z.infer<typeof V1ChatCompletionSchema>
