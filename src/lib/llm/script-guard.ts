import type { TextStreamPart, ToolSet } from "ai"

/**
 * Foreign-script guard for Latin-script answers (QA INC-002 / CHAT-045 /
 * CHAT-056 / CHAT-030).
 *
 * Some models leak CJK, Cyrillic or Arabic tokens into Indonesian answers —
 * "sistem机器 yang…", "cabang人工智能", "telah 广泛应用 di…". A prompt rule makes
 * it rarer but not rare enough: after adding one, a live run still produced
 * "广泛应用" in one answer out of six. So the stream itself is checked: a
 * foreign-script run is held back, replaced by an in-context translation
 * (validated to be clean), or dropped if no clean replacement arrives.
 *
 * Only for conversations whose user writes in Latin script — a user who
 * writes Japanese gets Japanese back untouched.
 */

// Hiragana/Katakana, CJK (incl. ext. A) and compatibility ideographs, Hangul,
// Cyrillic, Arabic, and CJK punctuation / full-width forms.
const FOREIGN = "\\u3000-\\u30ff\\u3400-\\u9fff\\uf900-\\ufaff\\uac00-\\ud7af\\u0400-\\u04ff\\u0600-\\u06ff\\uff00-\\uffef"
const FOREIGN_CHAR = new RegExp(`[${FOREIGN}]`)
const FOREIGN_RUN_AT_START = new RegExp(`^[${FOREIGN}]+(?:[ \\t]+[${FOREIGN}]+)*`)

export function containsForeignScript(text: string): boolean {
  return FOREIGN_CHAR.test(text)
}

/** Given the user's text, should their answer be guarded? */
export function shouldGuardScript(userText: string): boolean {
  return /[A-Za-z]/.test(userText) && !containsForeignScript(userText)
}

export type ScriptRepair = (fragment: string, context: { before: string; after: string }) => Promise<string | null>

const MAX_REPLACEMENT = 80

function cleanReplacement(raw: string | null | undefined): string {
  if (!raw) return ""
  const text = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "")
    .trim()
  if (!text || text.length > MAX_REPLACEMENT || containsForeignScript(text) || /\n/.test(text)) {
    return ""
  }
  return text
}

const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c)

export function createScriptGuardTransform<TOOLS extends ToolSet>(repair: ScriptRepair) {
  return (_options: { tools: TOOLS; stopStream: () => void }) => {
    let buffer = ""
    let emitted = "" // tail of what has been sent, for context and spacing
    let id = ""

    const remember = (text: string) => {
      emitted = (emitted + text).slice(-300)
    }

    const emit = (
      controller: TransformStreamDefaultController<TextStreamPart<TOOLS>>,
      text: string,
    ) => {
      if (!text) return
      controller.enqueue({ type: "text-delta", id, text } as unknown as TextStreamPart<TOOLS>)
      remember(text)
    }

    const replaceRun = async (run: string, after: string): Promise<string> => {
      let replacement = ""
      try {
        replacement = cleanReplacement(await repair(run, { before: emitted.slice(-200), after: after.slice(0, 120) }))
      } catch {
        replacement = ""
      }
      console.warn(
        `[script-guard] replaced foreign-script run ${JSON.stringify(run)} with ${JSON.stringify(replacement)}`,
      )
      if (!replacement) return ""
      // "sistem机器 yang" → "sistem mesin yang", not "sistemmesin yang".
      const lead = isWordChar(emitted.slice(-1)) && isWordChar(replacement[0]) ? " " : ""
      const trail = isWordChar(replacement.slice(-1)) && isWordChar(after[0]) ? " " : ""
      return lead + replacement + trail
    }

    /** Emit everything in the buffer that can be settled; hold an open run. */
    const drain = async (
      controller: TransformStreamDefaultController<TextStreamPart<TOOLS>>,
      final: boolean,
    ) => {
      for (;;) {
        const at = buffer.search(FOREIGN_CHAR)
        if (at === -1) {
          emit(controller, buffer)
          buffer = ""
          return
        }
        emit(controller, buffer.slice(0, at))
        buffer = buffer.slice(at)
        const run = buffer.match(FOREIGN_RUN_AT_START)![0]
        const rest = buffer.slice(run.length)
        // The run may continue in the next delta — wait unless this is the end.
        if (!final && rest.replace(/^[ \t]+/, "") === "") return
        buffer = rest
        emit(controller, await replaceRun(run, rest))
      }
    }

    return new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
      async transform(chunk, controller) {
        if (chunk.type === "text-delta") {
          const part = chunk as unknown as { id?: string; text?: string; textDelta?: string }
          id = part.id ?? id
          buffer += part.text ?? part.textDelta ?? ""
          await drain(controller, false)
          return
        }
        if (chunk.type === "text-end" && buffer) {
          await drain(controller, true)
        }
        controller.enqueue(chunk)
      },
      async flush(controller) {
        if (buffer) await drain(controller, true)
      },
    })
  }
}

/**
 * Repair via a short, bounded model call. Takes the language model so the
 * module stays free of provider wiring (and testable with a fake).
 */
export function createModelScriptRepair(
  generate: (prompt: string, signal: AbortSignal) => Promise<string>,
  timeoutMs = 5_000,
): ScriptRepair {
  return async (fragment, { before, after }) => {
    const prompt = `A reply written in Indonesian or English accidentally contains a fragment in another script. Give the words that should replace the fragment so the sentence reads naturally in the reply's language. Output ONLY the replacement words — no quotes, no explanation.

Text before: ${JSON.stringify(before)}
Fragment: ${JSON.stringify(fragment)}
Text after: ${JSON.stringify(after)}`
    return generate(prompt, AbortSignal.timeout(timeoutMs))
  }
}
