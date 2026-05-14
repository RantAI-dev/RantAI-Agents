/**
 * Citation grounding pass.
 *
 * After the model finishes streaming, parse `[Doc Title — Section]` markers
 * from the answer text and verify each cited title appears in the retrieved
 * chunks. Reports a grounded ratio and the list of unsupported citations so
 * we can detect hallucination drift over time.
 *
 * Observability-only: emits a structured log line and (optionally) sets
 * X-RAG-Citation-Grounded on the response. No content rewriting.
 *
 * Gated KB_CITATION_GROUNDING_ENABLED. The parse step is cheap; only the
 * gated path runs the comparison to keep the disabled cost at zero.
 */

export interface GroundingReport {
  /** Citations parsed from the answer text. */
  citations: Array<{ raw: string; title: string; section: string | null }>
  /** Citations whose title doesn't appear in any retrieved chunk. */
  unsupported: Array<{ raw: string; title: string }>
  /** supported / total. 1.0 = every citation grounded. */
  groundedRatio: number
  disabled: boolean
}

// Models emit citations in inconsistent formats. We parse the three most
// common we've seen in production logs:
//   [Document Title — Section]   (our RAG preamble's prescribed style)
//   [Document Title]              (no section)
//   **Document Title**            (markdown bold — MiniMax-M2.7 + others
//                                   default here even when prompted otherwise)
// We deliberately do NOT parse plain text mentions ("PSAK 113 says...") —
// those aren't unambiguous citation intent.
const BRACKETED_RE = /\[([^\[\]\n]{2,200})\]/g
const BOLD_RE = /\*\*([^*\n]{2,200})\*\*/g
const EMDASH_SPLIT = /\s+[—–-]\s+/

function parseCitations(text: string): Array<{ raw: string; title: string; section: string | null }> {
  const found = new Map<string, { raw: string; title: string; section: string | null }>()

  const consume = (re: RegExp) => {
    let match: RegExpExecArray | null
    re.lastIndex = 0
    while ((match = re.exec(text)) !== null) {
      const inner = match[1].trim()
      // Skip markdown link refs like [1] or [^note]
      if (/^\d+$/.test(inner) || inner.startsWith("^")) continue
      // Skip RAG-format placeholders
      if (/^(image|figure|table|chart|note):/i.test(inner)) continue
      // Skip bold runs that are obviously not citations (single common words,
      // formatting markers). Citations have at least one digit OR are >= 6
      // chars with at least one uppercase letter — heuristic but conservative.
      if (re === BOLD_RE) {
        const hasDigit = /\d/.test(inner)
        const hasCap = /[A-Z]/.test(inner)
        if (!hasDigit && (!hasCap || inner.length < 6)) continue
      }
      const parts = inner.split(EMDASH_SPLIT)
      const title = parts[0].trim()
      const section = parts.length > 1 ? parts.slice(1).join(" — ").trim() : null
      if (!title || title.length < 2) continue
      const key = `${title}::${section ?? ""}`
      if (!found.has(key)) {
        found.set(key, { raw: match[0], title, section })
      }
    }
  }

  consume(BRACKETED_RE)
  consume(BOLD_RE)
  return [...found.values()]
}

export function checkGrounding(
  answerText: string,
  retrievedDocTitles: string[]
): GroundingReport {
  if (process.env.KB_CITATION_GROUNDING_ENABLED !== "true") {
    return { citations: [], unsupported: [], groundedRatio: 1, disabled: true }
  }
  const citations = parseCitations(answerText)
  if (!citations.length) {
    return { citations: [], unsupported: [], groundedRatio: 1, disabled: false }
  }
  const haystack = retrievedDocTitles.map((t) => t.toLowerCase())
  const unsupported: Array<{ raw: string; title: string }> = []
  for (const c of citations) {
    const needle = c.title.toLowerCase()
    const matched = haystack.some((h) => h.includes(needle) || needle.includes(h))
    if (!matched) unsupported.push({ raw: c.raw, title: c.title })
  }
  const groundedRatio = (citations.length - unsupported.length) / citations.length
  return { citations, unsupported, groundedRatio, disabled: false }
}
