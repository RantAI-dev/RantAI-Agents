/**
 * Retrieval query for a guided-learning conversation.
 *
 * In a tutoring exchange the student's turns after the first are short answers
 * — "ya", "lanjut", "usus halus" — and retrieving on those alone drifts to
 * whatever book happens to contain the word. The topic of the conversation is
 * in its first user message, so a short follow-up is searched together with it.
 *
 * Off unless AGENT_API_ANCHOR_FIRST_TOPIC=true. No model call, unlike the
 * standalone-query rewrite, so it adds no latency and nothing leaves the host.
 */
type Msg = { role: string; content: string }

/** Follow-ups at least this long are treated as questions in their own right. */
const SELF_CONTAINED_CHARS = 60

export function anchorEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.AGENT_API_ANCHOR_FIRST_TOPIC === "true"
}

/** The anchored query, or null when the latest message should be used as is. */
export function anchoredQuery(messages: Msg[]): string | null {
  const users = messages.filter((m) => m.role === "user").map((m) => m.content.trim()).filter(Boolean)
  if (users.length < 2) return null
  const first = users[0]
  const latest = users[users.length - 1]
  if (latest.length >= SELF_CONTAINED_CHARS) return null
  if (latest.toLowerCase() === first.toLowerCase()) return null
  return `${first}\n${latest}`
}
