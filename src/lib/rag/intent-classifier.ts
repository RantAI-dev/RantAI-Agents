/**
 * Lightweight keyword-based query intent classifier.
 *
 * Five intents:
 *   - "enumerate" — list-style queries ("list semua PSAK", "sebutkan dokumen")
 *   - "compare"   — multi-doc comparison ("compare A and B", "bandingkan X")
 *   - "followup"  — short multi-turn refinement ("tell me more", "lalu")
 *   - "lookup"    — default; a specific factual query
 *   - "oos"       — out-of-scope canaries; not detected by keyword today
 *
 * Currently used for observability only — emitted in RAG_TRACE so future
 * eval runs can correlate retrieval quality with query intent. Routing per
 * intent (e.g. enumerate skips retrieval, compare raises maxChunks) is a
 * follow-up once the eval harness has a baseline.
 *
 * Gated behind KB_INTENT_CLASSIFIER_ENABLED. Returns "lookup" when disabled
 * so the trace stays consistent.
 */

export type QueryIntent = "lookup" | "enumerate" | "compare" | "followup" | "oos"

const ENUMERATE_PATTERNS = [
  /\blist (semua|seluruh|all)\b/i,
  /\bsebutkan (semua|seluruh)\b/i,
  /\bshow (me )?(all|every)\b/i,
  /\bwhat (documents|files) (do you|are)\b/i,
  /\bapa saja (dokumen|file)/i,
  /\bberapa (banyak|jumlah) (dokumen|file)/i,
  /\bdaftar (semua|seluruh|lengkap)/i,
  /\bdocuments? (do you have|are available)/i,
]

const COMPARE_PATTERNS = [
  /\bcompare\b/i,
  /\bbandingkan\b/i,
  /\bperbedaan(nya)? antara\b/i,
  /\bdifference between\b/i,
  /\b(A|X)\s+vs\.?\s+(B|Y)/i,
  /\bversus\b/i,
  /\bmana (yang )?(lebih|lebih baik)/i,
  /\bwhich is (better|more)/i,
]

const FOLLOWUP_PATTERNS = [
  /^(tell me more|more|continue|lanjut|lebih lanjut|terus|seterusnya)\b/i,
  /^(lalu|kemudian|then|next|after that)\b/i,
  /^(why|kenapa|mengapa)\??\s*$/i,
  /\bitu\b/i, // "itu" pronoun
  /\bnya\b\s*$/i, // possessive "nya" at end
]

export interface IntentClassification {
  intent: QueryIntent
  /** Why this intent was chosen — pattern matched or "default". */
  reason: string
  /** Set to true when the classifier is disabled (env not set); always returns "lookup" then. */
  disabled: boolean
}

export function classifyIntent(query: string, priorTurnCount = 0): IntentClassification {
  if (process.env.KB_INTENT_CLASSIFIER_ENABLED !== "true") {
    return { intent: "lookup", reason: "disabled", disabled: true }
  }

  const trimmed = query.trim()
  if (!trimmed) {
    return { intent: "lookup", reason: "empty-query", disabled: false }
  }

  for (const pattern of ENUMERATE_PATTERNS) {
    if (pattern.test(trimmed)) return { intent: "enumerate", reason: `pattern:${pattern.source}`, disabled: false }
  }
  for (const pattern of COMPARE_PATTERNS) {
    if (pattern.test(trimmed)) return { intent: "compare", reason: `pattern:${pattern.source}`, disabled: false }
  }
  // Follow-up patterns only fire on multi-turn threads + short queries.
  if (priorTurnCount > 1 && trimmed.length < 80) {
    for (const pattern of FOLLOWUP_PATTERNS) {
      if (pattern.test(trimmed)) return { intent: "followup", reason: `pattern:${pattern.source}`, disabled: false }
    }
  }

  return { intent: "lookup", reason: "default", disabled: false }
}
