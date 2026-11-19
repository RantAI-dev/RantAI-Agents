/**
 * Standalone-query rewrite for the v1 chat API's retrieval (2026-11-18
 * brief, task B).
 *
 * Retrieval used to search for the last user message's own words, so a
 * follow-up like "bandingkan dengan yang tadi" was searched as those
 * words. When the request carries at least one earlier user turn, this
 * module asks the base model — one short call, no retries, a hard timeout —
 * to rebuild the latest question into a standalone search query in the
 * user's language. Only retrieval sees the result; the conversation sent
 * to the answering model is untouched.
 *
 * Failure is never a request failure: a disabled rewrite, a first turn, a
 * thrown call, a timeout, an empty or overlong reply all hand back the
 * original last message. AGENT_API_QUERY_REWRITE=off switches the feature
 * off entirely.
 *
 * The log line carries the decision and its reason only — never the
 * question, which is user content.
 */
import { generateText } from "ai"
import { getChatProvider, resolveModelId } from "@/lib/llm/provider"

export interface RewriteMessage {
  role: string
  content: string
}

export interface QueryRewriteResult {
  /** The query retrieval should search with. */
  query: string
  /** "rewritten" when the model's output is in use, else "original". */
  used: "rewritten" | "original"
  /**
   * True when the model call was actually attempted. The chat service uses
   * this to keep AGENT_API_ANCHOR_FIRST_TOPIC working as the no-model-call
   * fallback while the rewrite is off — but NOT as a failure fallback, which
   * the brief fixes as "use the original last message".
   */
  ran: boolean
}

/** Any other value (including unset) leaves the rewrite on; "off" disables. */
export function queryRewriteEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (env.AGENT_API_QUERY_REWRITE || "").trim().toLowerCase() !== "off"
}

/** Hard per-call timeout, AGENT_API_QUERY_REWRITE_TIMEOUT_MS (default 6 s). */
export function queryRewriteTimeoutMs(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.AGENT_API_QUERY_REWRITE_TIMEOUT_MS)
  return Number.isFinite(n) && n > 0 ? n : 6000
}

/** Output cap — a question is short; ~64 tokens is generous. */
const MAX_OUTPUT_TOKENS = 64

/** A reply longer than this is not a question — treat as failure. */
const MAX_REPLY_CHARS = 300

/** How much of the conversation the prompt carries: the last ~6 messages. */
const HISTORY_MESSAGES = 6

/** Per-message truncation, so one long turn cannot eat the whole window. */
const HISTORY_SNIPPET_CHARS = 400

/** The messages before the latest one, as "role: text" lines. */
function historyLines(messages: RewriteMessage[]): string {
  return messages
    .slice(0, -1)
    .slice(-HISTORY_MESSAGES)
    .map((m) => {
      const text = m.content.replace(/\s+/g, " ").trim().slice(0, HISTORY_SNIPPET_CHARS)
      return text ? `${m.role}: ${text}` : ""
    })
    .filter(Boolean)
    .join("\n")
}

function rewritePrompt(history: string, question: string): string {
  return (
    "You turn the latest question of a conversation into ONE standalone search query " +
    "for a school textbook knowledge base.\n" +
    "- Resolve references to earlier turns (\"yang tadi\", \"bab sebelumnya\", \"the previous one\") " +
    "into the subject they point at, using the conversation.\n" +
    "- Reply with the standalone question ONLY: one line, no quotes, no labels, no explanation.\n" +
    "- Reply in the SAME language as the latest question.\n" +
    "- If the latest question is already standalone, repeat it unchanged.\n\n" +
    `Conversation:\n${history}\n\nLatest question: ${question}\n\nStandalone question:`
  )
}

/** First non-empty line, stripped of surrounding quotes and code fences —
 *  models sometimes wrap the reply in either. */
function cleanReply(raw: string): string {
  const firstLine =
    raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? ""
  return firstLine.replace(/^["'`]+|["'`]+$/g, "").trim()
}

function logRewrite(ms: number, used: "rewritten" | "original", reason: string): void {
  console.log(`[V1 API] query rewrite: ms=${ms} used=${used} reason=${reason}`)
}

/**
 * The query retrieval should use for this conversation. Never throws.
 *
 * First turns (fewer than two user messages) return the original without a
 * model call — there is nothing to resolve a reference against.
 */
export async function rewriteQueryForRetrieval(
  messages: RewriteMessage[],
  original: string,
): Promise<QueryRewriteResult> {
  const userTurns = messages.filter((m) => m.role === "user" && m.content.trim().length > 0)
  if (userTurns.length < 2) {
    return { query: original, used: "original", ran: false }
  }
  if (!queryRewriteEnabled()) {
    logRewrite(0, "original", "off")
    return { query: original, used: "original", ran: false }
  }

  const history = historyLines(messages)
  const started = Date.now()
  try {
    const { text } = await generateText({
      model: getChatProvider()(resolveModelId("base")),
      prompt: rewritePrompt(history, original),
      // One short call: no SDK retries, a hard timeout, a tiny output cap.
      maxRetries: 0,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      abortSignal: AbortSignal.timeout(queryRewriteTimeoutMs()),
    })
    const cleaned = cleanReply(typeof text === "string" ? text : "")
    const ms = Date.now() - started
    if (!cleaned) {
      logRewrite(ms, "original", "empty")
      return { query: original, used: "original", ran: true }
    }
    if (cleaned.length > MAX_REPLY_CHARS) {
      logRewrite(ms, "original", "overlong")
      return { query: original, used: "original", ran: true }
    }
    logRewrite(ms, "rewritten", "ok")
    return { query: cleaned, used: "rewritten", ran: true }
  } catch (err) {
    const ms = Date.now() - started
    const name = (err as Error)?.name ?? ""
    const message = (err as Error)?.message ?? String(err)
    // AbortSignal.timeout surfaces as an abort-type error; name it a timeout
    // so the log says which side of the budget the call died on.
    const reason = /abort/i.test(name) || /abort/i.test(message.slice(0, 80)) ? "timeout" : `error:${message.slice(0, 80)}`
    logRewrite(ms, "original", reason)
    return { query: original, used: "original", ran: true }
  }
}
