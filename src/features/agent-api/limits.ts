/**
 * Input limits for the v1 chat API.
 *
 * An oversized request does not fail loudly on its own. It eats the prompt
 * budget, so retrieved excerpts are trimmed to make room and the answer loses
 * its grounding without any error; past the model's context window the upstream
 * rejects the call and the client sees a 500. A 400 that says why is better
 * than either.
 *
 * Both limits are off unless configured, so an existing deployment keeps its
 * behaviour:
 *   AGENT_API_MAX_USER_MESSAGE_CHARS  reject a user message longer than this
 *   AGENT_API_MAX_HISTORY_MESSAGES    send the model only the most recent turns
 */

export interface InputLimits {
  maxUserMessageChars: number | null
  maxHistoryMessages: number | null
}

type Message = { role: "system" | "user" | "assistant"; content: string }

export type InputLimitResult<M extends Message> =
  | { messages: M[] }
  | { error: string; code: "message_too_long" }

/** A positive integer, or null. Zero, negatives and junk mean "no limit": a
 *  typo must not turn into a limit of zero that rejects every request. */
function positiveInt(raw: string | undefined): number | null {
  if (!raw || !/^\d+$/.test(raw.trim())) return null
  const n = Number(raw)
  return n > 0 ? n : null
}

export function inputLimits(env: NodeJS.ProcessEnv = process.env): InputLimits {
  return {
    maxUserMessageChars: positiveInt(env.AGENT_API_MAX_USER_MESSAGE_CHARS),
    maxHistoryMessages: positiveInt(env.AGENT_API_MAX_HISTORY_MESSAGES),
  }
}

export function applyInputLimits<M extends Message>(messages: M[], limits: InputLimits): InputLimitResult<M> {
  const { maxUserMessageChars, maxHistoryMessages } = limits

  if (maxUserMessageChars !== null) {
    // Only user turns: the client replays history, and an answer we wrote
    // ourselves must not make the next turn fail.
    for (const m of messages) {
      if (m.role !== "user") continue
      // Code points, not UTF-16 units or bytes, so the count matches what a
      // person sees in the input box.
      const length = Array.from(m.content).length
      if (length > maxUserMessageChars) {
        return {
          error: `A user message is ${length} characters long; the limit is ${maxUserMessageChars}. Shorten the message and try again.`,
          code: "message_too_long",
        }
      }
    }
  }

  if (maxHistoryMessages === null) return { messages }

  const system = messages.filter((m) => m.role === "system")
  let turns = messages.filter((m) => m.role !== "system")
  if (turns.length <= maxHistoryMessages) return { messages }

  turns = turns.slice(-maxHistoryMessages)
  // Chat templates with strict user/assistant alternation reject a
  // conversation that opens on the assistant, so drop an orphaned answer.
  while (turns.length > 1 && turns[0].role === "assistant") turns = turns.slice(1)
  return { messages: [...system, ...turns] }
}
