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
