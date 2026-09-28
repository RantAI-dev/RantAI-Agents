/**
 * Pure decisions for the chat SSE loop in chat-workspace.tsx: when a silent
 * stream counts as dead, how a failed stream is classified, and what to do
 * with `{"type":"error"}` events the server emits mid-stream.
 */

/** No bytes for this long while the model is talking ⇒ connection is dead. */
export const STREAM_INACTIVITY_MS = 60_000
/**
 * While a tool call is executing the server legitimately sends nothing (code
 * interpreter, web search, KB retrieval), so the watchdog allows longer.
 */
export const STREAM_TOOL_INACTIVITY_MS = 300_000
/** How often the watchdog checks. */
export const STREAM_WATCHDOG_INTERVAL_MS = 5_000

export const CONNECTION_LOST_MESSAGE =
  "Connection lost. The response was interrupted — check your connection and retry."

export function isStreamStalled(input: {
  msSinceLastByte: number
  toolRunning: boolean
}): boolean {
  const limit = input.toolRunning ? STREAM_TOOL_INACTIVITY_MS : STREAM_INACTIVITY_MS
  return input.msSinceLastByte >= limit
}

/** Tool-call states that mean "started but no result yet". */
const TERMINAL_TOOL_STATES = new Set(["result", "done", "error", "output-error"])

export function hasRunningToolCall(states: Iterable<string>): boolean {
  for (const state of states) {
    if (!TERMINAL_TOOL_STATES.has(state)) return true
  }
  return false
}

/** Why the client aborted a stream on its own (null = it didn't). */
export type StreamAbortReason = "offline" | "stalled" | null

export type StreamFailureKind = "user-abort" | "connection-lost" | "error"

/**
 * Distinguishes the silent user Stop (AbortError, no reason recorded) from a
 * watchdog/offline abort (AbortError too, but with a reason) and from every
 * other failure. A thrown TypeError from fetch/read while the browser reports
 * offline is also a lost connection.
 */
export function classifyStreamFailure(
  err: unknown,
  abortReason: StreamAbortReason,
  isOnline: boolean = true,
): StreamFailureKind {
  if (abortReason) return "connection-lost"
  const name = (err as { name?: string } | null)?.name
  if (name === "AbortError") return "user-abort"
  if (!isOnline) return "connection-lost"
  if (err instanceof TypeError && /network|fetch|load failed/i.test(err.message)) {
    return "connection-lost"
  }
  return "error"
}

/**
 * Outcome once the stream has ended, given any `{"type":"error"}` events seen.
 * Providers/tools sometimes emit a transient error and then recover; when the
 * assistant produced output the error is only logged. When nothing came back,
 * the server's errorText is the most useful thing to show.
 */
export function resolveStreamErrorEvents(input: {
  errorTexts: string[]
  hasOutput: boolean
}): { surface: false } | { surface: true; message: string } {
  if (input.errorTexts.length === 0 || input.hasOutput) return { surface: false }
  const last = input.errorTexts[input.errorTexts.length - 1]?.trim()
  return {
    surface: true,
    message: last || "The assistant ran into an error. Please try again.",
  }
}

/** Error carrying a server-provided message that should be shown verbatim. */
export class StreamServerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "StreamServerError"
  }
}
