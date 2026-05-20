import type { TextStreamPart, ToolSet } from "ai"

/**
 * Reasoning models (MiniMax-M2.7, some o1-style providers, Gemini thinking
 * variants) emit chain-of-thought inside literal `<think>...</think>` tags as
 * part of the text stream. The OpenAI-compatible streamText path passes those
 * characters through unchanged, so the end user sees raw reasoning prepended
 * to the answer (see the 2026-05-13 production capture).
 *
 * This transform parses the streaming text-delta chunks and silently drops
 * everything inside the matching close tag, including the tags themselves.
 * Other chunk types (tool-call, reasoning, finish, etc.) pass through.
 *
 * Implementation notes:
 *   - Tags can split across stream chunks (e.g. "...<thi" then "nk>more")
 *     so we hold back up to 7 characters of trailing buffer that could be a
 *     partial opener; the close-tag uses an 8-character horizon for "</think>".
 *   - When a tag is open at stream end without a closer, we treat the rest
 *     as buffered-and-discarded — better to lose a trailing planning blob
 *     than leak it.
 *   - Whitespace immediately after the </think> close is collapsed to a
 *     single newline so the answer doesn't start with awkward blank space.
 */

const OPEN_TAG = "<think>"
const CLOSE_TAG = "</think>"
const OPEN_PEEK = OPEN_TAG.length - 1 // 6 — biggest prefix that could start an opener
const CLOSE_PEEK = CLOSE_TAG.length - 1 // 7 — biggest prefix that could start a closer

/**
 * Factory matching AI SDK v6's StreamTextTransform shape:
 *   (options: { tools, stopStream }) => TransformStream<TextStreamPart, TextStreamPart>
 *
 * Pass into streamText({ experimental_transform: createStripThinkTransform() }).
 */
export function createStripThinkTransform<TOOLS extends ToolSet>() {
  return (_options: { tools: TOOLS; stopStream: () => void }) => {
    let inThink = false
    let buffer = ""
    let emittedAnything = false // for the post-close whitespace collapse

    return new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
    transform(chunk, controller) {
      // Only filter text-delta. Reasoning, tool-call, etc. pass through untouched.
      if (chunk.type !== "text-delta") {
        controller.enqueue(chunk)
        return
      }

      // AI SDK v6 uses `text` (was `textDelta` in v4/5). Tolerate both shapes.
      const part = chunk as unknown as { textDelta?: string; text?: string }
      const deltaIn = part.textDelta ?? part.text ?? ""
      buffer += deltaIn

      let output = ""
      let keepLooping = true

      while (keepLooping) {
        keepLooping = false
        if (!inThink) {
          const openIdx = buffer.indexOf(OPEN_TAG)
          if (openIdx === -1) {
            // No opener found. Emit all but the last OPEN_PEEK chars — those
            // could be the start of a tag we'll see complete in the next chunk.
            if (buffer.length > OPEN_PEEK) {
              output += buffer.slice(0, buffer.length - OPEN_PEEK)
              buffer = buffer.slice(buffer.length - OPEN_PEEK)
            }
          } else {
            // Emit everything before the opener.
            output += buffer.slice(0, openIdx)
            buffer = buffer.slice(openIdx + OPEN_TAG.length)
            inThink = true
            keepLooping = true
          }
        } else {
          const closeIdx = buffer.indexOf(CLOSE_TAG)
          if (closeIdx === -1) {
            // No closer yet. Discard all but the last CLOSE_PEEK chars (those
            // could be the start of "</think>" still arriving).
            if (buffer.length > CLOSE_PEEK) {
              buffer = buffer.slice(buffer.length - CLOSE_PEEK)
            }
          } else {
            // Skip everything up to and including the closer.
            buffer = buffer.slice(closeIdx + CLOSE_TAG.length)
            inThink = false
            // Collapse the whitespace that often follows the close tag
            // (model usually emits "\n\n" right after </think>).
            const leadingWs = buffer.match(/^\s+/)
            if (leadingWs) {
              buffer = buffer.slice(leadingWs[0].length)
              if (emittedAnything) {
                // preserve a single newline boundary
                output += "\n\n"
              }
            }
            keepLooping = true
          }
        }
      }

      if (output) {
        emittedAnything = true
        // Re-emit with the same shape as the incoming chunk.
        const replaced =
          part.textDelta !== undefined
            ? ({ ...chunk, textDelta: output } as TextStreamPart<TOOLS>)
            : ({ ...chunk, text: output } as TextStreamPart<TOOLS>)
        controller.enqueue(replaced)
      }
    },
      flush(controller) {
        // Drain any leftover safe-to-emit buffer at stream end.
        if (!inThink && buffer.length) {
          // We held back OPEN_PEEK chars in case a tag was forming — none did, emit them.
          const emit = buffer
          buffer = ""
          controller.enqueue({ type: "text-delta", textDelta: emit } as unknown as TextStreamPart<TOOLS>)
        }
        // If inThink at end → discard the unclosed buffer silently. Better to
        // drop a stray planning blob than leak it.
      },
    })
  }
}

/**
 * Like createStripThinkTransform, but instead of dropping `<think>...</think>`
 * content it re-emits it as AI SDK v6 reasoning parts (reasoning-start /
 * reasoning-delta / reasoning-end). The client renders these inside the
 * "Thinking" disclosure on each assistant message.
 *
 * Use this for surfaces where the user benefits from seeing the model's
 * chain-of-thought (the main dashboard chat). Keep `createStripThinkTransform`
 * for surfaces where reasoning should stay private (chatflow, public API).
 */
export function createExtractThinkTransform<TOOLS extends ToolSet>() {
  return (_options: { tools: TOOLS; stopStream: () => void }) => {
    let inThink = false
    let buffer = ""
    let emittedAnyText = false
    let reasoningId: string | null = null

    return new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
      transform(chunk, controller) {
        // text-end signals the model has finished a text part. We need to
        // flush any held-back buffer (up to OPEN_PEEK chars we were holding
        // in case a `<think>` opener was forming) BEFORE the text-end
        // propagates — otherwise those characters are dropped, which on
        // short answers can mean the visible content is empty.
        if (chunk.type === "text-end") {
          if (!inThink && buffer.length > 0) {
            const tail = buffer
            buffer = ""
            const endId = (chunk as unknown as { id: string }).id
            controller.enqueue({
              type: "text-delta",
              id: endId,
              text: tail,
            } as unknown as TextStreamPart<TOOLS>)
          }
          controller.enqueue(chunk)
          return
        }

        if (chunk.type !== "text-delta") {
          controller.enqueue(chunk)
          return
        }

        const part = chunk as unknown as { textDelta?: string; text?: string }
        const deltaIn = part.textDelta ?? part.text ?? ""
        buffer += deltaIn

        let outText = ""
        let outReason = ""
        let justClosedThink = false
        let keepLooping = true

        while (keepLooping) {
          keepLooping = false
          if (!inThink) {
            const openIdx = buffer.indexOf(OPEN_TAG)
            if (openIdx === -1) {
              if (buffer.length > OPEN_PEEK) {
                outText += buffer.slice(0, buffer.length - OPEN_PEEK)
                buffer = buffer.slice(buffer.length - OPEN_PEEK)
              }
            } else {
              outText += buffer.slice(0, openIdx)
              buffer = buffer.slice(openIdx + OPEN_TAG.length)
              inThink = true
              keepLooping = true
              // Lazily start a reasoning block on first enter. Multiple
              // `<think>` blocks in one response reuse the same id so the
              // UI can render a single "Thinking" disclosure containing
              // every reasoning segment, separated by a blank line.
              if (!reasoningId) {
                reasoningId = crypto.randomUUID()
                controller.enqueue({
                  type: "reasoning-start",
                  id: reasoningId,
                } as unknown as TextStreamPart<TOOLS>)
              } else {
                // Separator between consecutive reasoning segments.
                outReason += "\n\n"
              }
            }
          } else {
            const closeIdx = buffer.indexOf(CLOSE_TAG)
            if (closeIdx === -1) {
              if (buffer.length > CLOSE_PEEK) {
                outReason += buffer.slice(0, buffer.length - CLOSE_PEEK)
                buffer = buffer.slice(buffer.length - CLOSE_PEEK)
              }
            } else {
              outReason += buffer.slice(0, closeIdx)
              buffer = buffer.slice(closeIdx + CLOSE_TAG.length)
              inThink = false
              justClosedThink = true
              const leadingWs = buffer.match(/^\s+/)
              if (leadingWs) {
                buffer = buffer.slice(leadingWs[0].length)
                if (emittedAnyText) outText += "\n\n"
              }
              keepLooping = true
            }
          }
        }

        if (outReason && reasoningId) {
          // AI SDK v6's runtime UI-stream serializer reads `part.text` and
          // writes wire `delta` (see ai/dist/index.js:7127). The .d.ts at
          // line 1786 mislabels the TextStreamPart field as `delta`, but
          // emitting `delta` from a transform leaves `part.text` undefined
          // and the wire payload comes out as `{type, id}` with no content.
          // Emit `text` to make the serializer happy.
          controller.enqueue({
            type: "reasoning-delta",
            id: reasoningId,
            text: outReason,
          } as unknown as TextStreamPart<TOOLS>)
        }
        // Note: we don't emit reasoning-end on every think-close. The model
        // may open another <think> block later, and we want one unified
        // reasoning section per assistant message. reasoning-end fires in
        // flush(), once the stream is finished for real.
        void justClosedThink
        if (outText) {
          emittedAnyText = true
          const replaced =
            part.textDelta !== undefined
              ? ({ ...chunk, textDelta: outText } as TextStreamPart<TOOLS>)
              : ({ ...chunk, text: outText } as TextStreamPart<TOOLS>)
          controller.enqueue(replaced)
        }
      },
      flush(controller) {
        // Intentionally don't emit a trailing text-delta here even if `buffer`
        // is non-empty. By the time flush runs, the upstream provider has
        // already sent `text-end` for the answer; emitting more text-delta
        // afterward causes the UI message stream serializer to error with
        // "text part undefined not found". The held-back bytes (max 6 chars
        // of OPEN_PEEK) would only matter if the model truncated mid-response
        // — extremely unlikely to contain meaningful content. Drop them.
        if (reasoningId) {
          controller.enqueue({
            type: "reasoning-end",
            id: reasoningId,
          } as unknown as TextStreamPart<TOOLS>)
          reasoningId = null
        }
      },
    })
  }
}
