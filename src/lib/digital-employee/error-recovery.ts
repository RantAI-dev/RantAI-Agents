export type ErrorClassification = "transient" | "permanent" | "ambiguous"

interface ErrorPattern {
  pattern: RegExp
  classification: ErrorClassification
  suggestedFix?: string
}

const ERROR_PATTERNS: ErrorPattern[] = [
  // Transient
  { pattern: /timeout|timed out|ETIMEDOUT/i, classification: "transient", suggestedFix: "Retry with longer timeout" },
  { pattern: /rate.?limit|too many requests|429/i, classification: "transient", suggestedFix: "Wait and retry with backoff" },
  { pattern: /ECONNRESET|ECONNREFUSED|ENOTFOUND/i, classification: "transient", suggestedFix: "Check network connectivity" },
  { pattern: /503|502|504|service.?unavailable/i, classification: "transient", suggestedFix: "Service temporarily unavailable, retry later" },
  { pattern: /temporary|retry/i, classification: "transient" },

  // Permanent
  { pattern: /401|unauthorized|invalid.?token|invalid.?key/i, classification: "permanent", suggestedFix: "Check and update credentials" },
  { pattern: /403|forbidden|permission.?denied/i, classification: "permanent", suggestedFix: "Check permissions and access rights" },
  { pattern: /404|not.?found/i, classification: "permanent", suggestedFix: "Resource does not exist, check configuration" },
  { pattern: /400|bad.?request|invalid.?input|validation/i, classification: "permanent", suggestedFix: "Fix input data or parameters" },
  { pattern: /syntax.?error|parse.?error/i, classification: "permanent", suggestedFix: "Fix code or configuration syntax" },
]

export function classifyError(error: string): ErrorClassification {
  for (const { pattern, classification } of ERROR_PATTERNS) {
    if (pattern.test(error)) return classification
  }
  return "ambiguous"
}

export function shouldRetry(classification: ErrorClassification, retryCount: number, maxRetries: number = 3): boolean {
  if (classification === "permanent") return false
  if (retryCount >= maxRetries) return false
  return true
}

export function getRetryDelay(retryCount: number, baseMs: number = 1000): number {
  // Exponential backoff with jitter
  const exponential = baseMs * Math.pow(2, retryCount)
  const jitter = Math.random() * baseMs
  return Math.min(exponential + jitter, 60000) // max 60s
}

export interface ErrorPatternGroup {
  pattern: string
  count: number
  classification: ErrorClassification
  suggestedFix: string | null
  lastOccurrence: Date
  runIds: string[]
}

export function detectErrorPatterns(
  errors: Array<{ error: string; runId: string; createdAt: Date }>
): ErrorPatternGroup[] {
  const groups = new Map<string, ErrorPatternGroup>()

  for (const { error, runId, createdAt } of errors) {
    // Find matching pattern
    let key = "other"
    let suggestedFix: string | null = null
    let classification: ErrorClassification = "ambiguous"

    for (const ep of ERROR_PATTERNS) {
      if (ep.pattern.test(error)) {
        key = ep.pattern.source
        suggestedFix = ep.suggestedFix || null
        classification = ep.classification
        break
      }
    }

    const existing = groups.get(key)
    if (existing) {
      existing.count++
      existing.runIds.push(runId)
      if (createdAt > existing.lastOccurrence) {
        existing.lastOccurrence = createdAt
      }
    } else {
      groups.set(key, {
        pattern: key === "other" ? "Unknown errors" : error.slice(0, 80),
        count: 1,
        classification,
        suggestedFix,
        lastOccurrence: createdAt,
        runIds: [runId],
      })
    }
  }

  return Array.from(groups.values())
    .filter((g) => g.count >= 2)
    .sort((a, b) => b.count - a.count)
}
