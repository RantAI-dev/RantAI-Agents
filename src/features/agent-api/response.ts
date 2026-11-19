import type { streamText } from "ai"
import type { InlineFigureFeed } from "./inline-figures"

/**
 * Response builders for the v1 chat API, kept free of database and provider
 * imports so the wire format can be tested against a fake model stream.
 */

/** Sources (KB documents) an answer drew on, for the client to render references. */
import type { Grounding } from "./grounding"
import { selectResponseSources, type ScoredSource, type SourceSelection } from "./source-selection"

export type RagSource = {
  title: string
  section: string | null
  documentId?: string | null
  assetKey?: string | null
  page?: number | null
  chunkType?: string | null
  kbOrigin?: "remote"
  /** These two have always been on the wire objects (service.ts maps them
   *  from the retrieval result); the type just never said so. */
  chunkIndex?: number | null
  anchorChunkIndex?: number | null
  /** The 1-based `[n]` the model was shown for this source — see
   *  source-selection.ts for the verified number ↔ index mapping. */
  number?: number
  /** Whether the answer text cited `[n]` (UAT issue 7). */
  cited?: boolean
  /** Signed, expiring link to the book page behind the reference (UAT
   *  issue 7) — minted in source-links.ts; absent when the deployment sets
   *  no AGENT_API_LINK_SECRET or the source has nothing linkable. */
  page_url?: string
}

export function createSSEStreamResponse(
  result: Pick<ReturnType<typeof streamText>, "textStream" | "finishReason" | "totalUsage">,
  requestId: string,
  modelId: string,
  sources: RagSource[] = [],
  figures?: InlineFigureFeed,
  grounding?: Grounding,
  /**
   * Citation-aware source filtering (UAT issues 4/7). Omitted — as every
   * pre-existing caller does — the sources list rides the final frame
   * untouched, byte for byte what it was. When given, `sources` must
   * actually be `ScoredSource[]` (the chat service always sends the scored
   * form) and only the sources the finished text cites (default), plus the
   * floor and fallback rules, are emitted — see source-selection.ts.
   */
  selection?: SourceSelection,
): Response {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // The selection needs the WHOLE answer before it can know which
        // `[n]` were cited, so the stream is collected as it is emitted.
        // The frames themselves do not change.
        let fullText = ""
        for await (const chunk of result.textStream) {
          fullText += chunk
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

          // Inline figures: once this delta completes a `[figure:N]` tag, the
          // image follows immediately in its own frame, so a client can place
          // it where the sentence is rather than after the whole answer. The
          // frame is an ordinary chunk with an empty delta plus a custom
          // top-level `figure` — OpenAI clients skip it, ours read it.
          if (figures) {
            for (const figure of await figures.onDelta(chunk)) {
              const figureData = JSON.stringify({
                id: requestId,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model: modelId,
                choices: [{ index: 0, delta: {}, finish_reason: null }],
                figure,
              })
              controller.enqueue(encoder.encode(`data: ${figureData}\n\n`))
            }
          }
        }

        // Figures retrieval selected for this answer that the text never cited
        // follow the text, so a client can still show them.
        if (figures) {
          for (const figure of await figures.remaining()) {
            const figureData = JSON.stringify({
              id: requestId,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model: modelId,
              choices: [{ index: 0, delta: {}, finish_reason: null }],
              figure,
            })
            controller.enqueue(encoder.encode(`data: ${figureData}\n\n`))
          }
        }

        // Final chunk with finish_reason. `sources` is a custom top-level field
        // (OpenAI clients ignore unknown keys) carrying the KB references so a
        // frontend can render reference cards.
        //
        // finish_reason is read from the SDK rather than hardcoded: a stream cut
        // short by a dead upstream must not be reported as a clean "stop", or the
        // client renders a half-sentence as a finished answer.
        const finishReason = toOpenAIFinishReason(
          await Promise.resolve(result.finishReason).catch(() => undefined)
        )
        // UAT issues 4/7: the final frame carries the filtered selection —
        // cited-only by default — with the `[n]` numbers the model saw.
        const finalSources = selection
          ? selectResponseSources(sources as ScoredSource[], fullText, selection)
          : sources
        const finalData = JSON.stringify({
          id: requestId,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: modelId,
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: finishReason,
            },
          ],
          ...(finishReason === "error" && {
            error: {
              message:
                "Generation did not complete — the model backend ended the stream early. The text above may be truncated.",
              type: "server_error",
            },
          }),
          sources: finalSources,
          // Present only when retrieval ran; see grounding.ts.
          ...(grounding && { grounded: grounding.grounded, retrieval_score: grounding.retrieval_score }),
        })
        controller.enqueue(encoder.encode(`data: ${finalData}\n\n`))

        // Terminal usage frame — OpenAI-compatible (empty choices + usage).
        // Lets the credit tracker deduct REAL token counts instead of estimating.
        // Wrapped so a usage-resolution failure can't break the client stream.
        try {
          const usage = await result.totalUsage
          const usageData = JSON.stringify({
            id: requestId,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: modelId,
            choices: [],
            usage: {
              prompt_tokens: usage.inputTokens ?? 0,
              completion_tokens: usage.outputTokens ?? 0,
              total_tokens: usage.totalTokens ?? 0,
            },
          })
          controller.enqueue(encoder.encode(`data: ${usageData}\n\n`))
        } catch {
          // Usage unavailable — client stream stays intact; tracker falls back.
        }

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

/**
 * Map the SDK's finish reason onto the OpenAI wire value.
 *
 * The point of this function is the failure case. When the upstream dies
 * mid-generation the SDK resolves with `error`/`other`/`unknown` and whatever
 * text arrived before the break — previously both response builders hardcoded
 * `"stop"`, so a half-sentence produced by a dead gateway was indistinguishable
 * from a complete answer. That is the worst possible shape for a classroom
 * client: it renders truncated nonsense as if the tutor meant it.
 *
 * `length` and `tool-calls` are legitimate OpenAI values and pass through.
 * Everything else becomes `"error"`, which no client mistakes for success.
 */
export function toOpenAIFinishReason(reason: string | undefined): string {
  switch (reason) {
    case "stop":
      return "stop"
    case "length":
      return "length"
    case "content-filter":
      return "content_filter"
    case "tool-calls":
      return "tool_calls"
    default:
      return "error"
  }
}

export async function createJsonResponse(
  result: Pick<ReturnType<typeof streamText>, "text" | "finishReason" | "totalUsage">,
  requestId: string,
  modelId: string,
  sources: RagSource[] = [],
  figures?: InlineFigureFeed,
  grounding?: Grounding,
  /** See createSSEStreamResponse: omitted ⇒ today's sources list verbatim;
   *  given ⇒ the scored list filtered per source-selection.ts. */
  selection?: SourceSelection,
): Promise<Response> {
  const text = await result.text
  const usage = await result.totalUsage
  const finishReason = toOpenAIFinishReason(
    await Promise.resolve(result.finishReason).catch(() => undefined)
  )
  // UAT issues 4/7: the body carries the cited-only selection by default,
  // with the `[n]` numbers the model saw.
  const finalSources = selection
    ? selectResponseSources(sources as ScoredSource[], text, selection)
    : sources

  const body = {
    id: requestId,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: modelId,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: finishReason,
      },
    ],
    ...(finishReason === "error" && {
      error: {
        message:
          "Generation did not complete — the model backend ended the stream early. The text above may be truncated.",
        type: "server_error",
      },
    }),
    usage: {
      prompt_tokens: usage.inputTokens ?? 0,
      completion_tokens: usage.outputTokens ?? 0,
      total_tokens: usage.totalTokens ?? 0,
    },
    // KB references the answer drew on (custom field; OpenAI clients ignore
    // it) — the cited-only, floor-passing selection by default (UAT 4/7).
    sources: finalSources,
    // Present only when retrieval ran; see grounding.ts.
    ...(grounding && { grounded: grounding.grounded, retrieval_score: grounding.retrieval_score }),
    // Images for the `[figure:N]` tags in the answer, only when the request
    // asked for them. Absent rather than empty otherwise, so the default body
    // is byte-for-byte what it was.
    ...(figures && { figures: [...(await figures.forText(text)), ...(await figures.remaining())] }),
  }

  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  })
}
