/**
 * Search-in-content for the code artifact panel.
 *
 * Two responsibilities:
 *
 * 1. `findMatches` — pure text scan over the artifact's raw `content`,
 *    returning 1-indexed line/column ranges. Case-insensitive, plain text
 *    (no regex parsing in v1).
 *
 * 2. `applyHighlights` / `clearHighlights` — DOM-side highlighting over
 *    the rendered code body. Prefers the CSS Custom Highlight API
 *    (`CSS.highlights`) which doesn't mutate the DOM; falls back to
 *    wrapping matched text nodes in `<mark class="code-search-match">`.
 */

export interface SearchMatch {
  /** 1-indexed line number where the match starts. */
  startLine: number
  /** 0-indexed column where the match starts. */
  startCol: number
  /** 1-indexed line number where the match ends. */
  endLine: number
  /** 0-indexed column where the match ends (exclusive). */
  endCol: number
}

export type HighlightMode = "css" | "dom"

const HIGHLIGHT_NAME = "code-search"
const HIGHLIGHT_NAME_CURRENT = "code-search-current"
const MARK_CLASS = "code-search-match"
const MARK_CLASS_CURRENT = "code-search-match-current"

const HIGHLIGHT_STYLE_ID = "code-search-highlight-styles"
const HIGHLIGHT_CSS = `
::highlight(${HIGHLIGHT_NAME}) {
  background-color: rgb(255 200 0 / 0.35);
  color: inherit;
}
::highlight(${HIGHLIGHT_NAME_CURRENT}) {
  background-color: rgb(255 140 0 / 0.85);
  color: rgb(0 0 0);
}
`

/**
 * Inject the `::highlight()` CSS rules at runtime. Lightning CSS (used by
 * Turbopack as of Next 16) doesn't recognize `::highlight()` as a valid
 * pseudo-element and rejects it at build time, so these rules can't live in
 * `globals.css`. Browsers parse the runtime-injected stylesheet without
 * complaint. Called once on first `applyHighlights` invocation.
 */
function ensureHighlightStyles(): void {
  if (typeof document === "undefined") return
  if (document.getElementById(HIGHLIGHT_STYLE_ID)) return
  const style = document.createElement("style")
  style.id = HIGHLIGHT_STYLE_ID
  style.textContent = HIGHLIGHT_CSS
  document.head.appendChild(style)
}

/**
 * Scan content for case-insensitive plain-text matches. Empty queries and
 * queries with no matches return an empty array. Overlapping matches are
 * returned as non-overlapping hits — the search advances past each match.
 */
export function findMatches(content: string, query: string): SearchMatch[] {
  if (!query) return []
  const haystack = content.toLowerCase()
  const needle = query.toLowerCase()
  const results: SearchMatch[] = []

  let cursor = 0
  while (cursor <= haystack.length - needle.length) {
    const idx = haystack.indexOf(needle, cursor)
    if (idx === -1) break
    results.push({
      ...positionToLineCol(content, idx),
      ...positionToEnd(content, idx + needle.length),
    })
    cursor = idx + needle.length
  }
  return results
}

function positionToLineCol(content: string, pos: number): { startLine: number; startCol: number } {
  let line = 1
  let lineStart = 0
  for (let i = 0; i < pos; i++) {
    if (content.charCodeAt(i) === 10 /* \n */) {
      line++
      lineStart = i + 1
    }
  }
  return { startLine: line, startCol: pos - lineStart }
}

function positionToEnd(content: string, pos: number): { endLine: number; endCol: number } {
  let line = 1
  let lineStart = 0
  for (let i = 0; i < pos; i++) {
    if (content.charCodeAt(i) === 10 /* \n */) {
      line++
      lineStart = i + 1
    }
  }
  return { endLine: line, endCol: pos - lineStart }
}

/** Walk text nodes within `root` and return them in document order. */
function collectTextNodes(root: HTMLElement): Text[] {
  const nodes: Text[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    nodes.push(node as Text)
    node = walker.nextNode()
  }
  return nodes
}

/**
 * Convert byte offsets in the source `content` to DOM Ranges within
 * `root`. Assumes the rendered text reproduces the source content
 * verbatim.
 */
function buildRanges(
  root: HTMLElement,
  matches: SearchMatch[],
  content: string,
): Range[] | null {
  const textNodes = collectTextNodes(root)
  const renderedText = textNodes.map((n) => n.data).join("")
  if (!renderedText.includes(content) && renderedText !== content) return null

  const offsets: { node: Text; start: number; end: number }[] = []
  let cursor = 0
  for (const node of textNodes) {
    offsets.push({ node, start: cursor, end: cursor + node.data.length })
    cursor += node.data.length
  }

  const sourceOffsetByLine = lineOffsetsOf(content)
  const ranges: Range[] = []

  for (const m of matches) {
    const startOffset = sourceOffsetByLine[m.startLine - 1] + m.startCol
    const endOffset = sourceOffsetByLine[m.endLine - 1] + m.endCol
    const startNode = offsets.find((o) => startOffset >= o.start && startOffset < o.end)
    const endNode = offsets.find((o) => endOffset > o.start && endOffset <= o.end)
    if (!startNode || !endNode) continue
    const range = document.createRange()
    range.setStart(startNode.node, startOffset - startNode.start)
    range.setEnd(endNode.node, endOffset - endNode.start)
    ranges.push(range)
  }
  return ranges
}

function lineOffsetsOf(content: string): number[] {
  const offsets: number[] = [0]
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) === 10) offsets.push(i + 1)
  }
  return offsets
}

interface CustomHighlightAPI {
  highlights?: Map<string, unknown> & {
    set(name: string, highlight: unknown): unknown
    delete(name: string): boolean
  }
}

interface HighlightCtor {
  new (...ranges: Range[]): unknown
}

function getHighlightApi(): { CSS: CustomHighlightAPI; Highlight: HighlightCtor } | null {
  if (typeof window === "undefined") return null
  const cssApi = (window as unknown as { CSS?: CustomHighlightAPI }).CSS
  const HighlightCtor = (window as unknown as { Highlight?: HighlightCtor }).Highlight
  if (!cssApi || !cssApi.highlights || !HighlightCtor) return null
  return { CSS: cssApi, Highlight: HighlightCtor }
}

export interface ApplyHighlightsResult {
  mode: HighlightMode
  /** The DOM range corresponding to the current match (if any), so the caller can scroll it into view. */
  currentRange: Range | null
}

/**
 * Apply highlights to `root` for the given `matches`. Returns the mode used
 * so the caller can pass the right value to `clearHighlights`, plus the
 * Range for the "current" match (the one at `currentMatchIndex`) so the
 * caller can scroll it into view.
 *
 * Two highlight families are registered:
 * - `code-search` covers all matches except the current one (background hits).
 * - `code-search-current` covers just the match at `currentMatchIndex`
 *   (visually distinct, e.g. a brighter orange).
 *
 * When `currentMatchIndex` is `undefined` or out of bounds, all matches go
 * into the `code-search` family (no "current" treatment).
 *
 * Returns `null` if there's nothing to render.
 */
export function applyHighlights(
  root: HTMLElement,
  matches: SearchMatch[],
  content: string,
  currentMatchIndex?: number,
): ApplyHighlightsResult | null {
  if (matches.length === 0) return null

  const ranges = buildRanges(root, matches, content)
  if (!ranges || ranges.length === 0) return null

  const hasCurrent =
    typeof currentMatchIndex === "number" &&
    currentMatchIndex >= 0 &&
    currentMatchIndex < ranges.length
  const currentRange = hasCurrent ? ranges[currentMatchIndex!] : null
  const otherRanges = hasCurrent
    ? ranges.filter((_, i) => i !== currentMatchIndex)
    : ranges

  const api = getHighlightApi()
  if (api) {
    try {
      ensureHighlightStyles()
      if (otherRanges.length > 0) {
        const others = new api.Highlight(...otherRanges) as unknown
        api.CSS.highlights!.set(HIGHLIGHT_NAME, others)
      } else {
        api.CSS.highlights!.delete(HIGHLIGHT_NAME)
      }
      if (currentRange) {
        const current = new api.Highlight(currentRange) as unknown
        api.CSS.highlights!.set(HIGHLIGHT_NAME_CURRENT, current)
      } else {
        api.CSS.highlights!.delete(HIGHLIGHT_NAME_CURRENT)
      }
      return { mode: "css", currentRange }
    } catch {
      // fall through to DOM mode
    }
  }

  // DOM fallback: wrap each range in a <mark>. Iterate from the end so
  // earlier ranges keep their offsets after surgery. Use the "current" class
  // for the match at currentMatchIndex.
  for (let i = ranges.length - 1; i >= 0; i--) {
    const range = ranges[i]
    const mark = document.createElement("mark")
    mark.className = i === currentMatchIndex ? MARK_CLASS_CURRENT : MARK_CLASS
    try {
      range.surroundContents(mark)
    } catch {
      // surroundContents fails on ranges that span element boundaries;
      // give up on this match rather than mutate broken DOM.
    }
  }
  return { mode: "dom", currentRange }
}

/** Tear down highlights applied via `applyHighlights`. */
export function clearHighlights(root: HTMLElement, mode: HighlightMode | null): void {
  if (mode === null) return
  if (mode === "css") {
    const api = getHighlightApi()
    api?.CSS.highlights?.delete(HIGHLIGHT_NAME)
    api?.CSS.highlights?.delete(HIGHLIGHT_NAME_CURRENT)
    return
  }
  const marks = root.querySelectorAll(`mark.${MARK_CLASS}, mark.${MARK_CLASS_CURRENT}`)
  marks.forEach((mark) => {
    const parent = mark.parentNode
    if (!parent) return
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
    parent.removeChild(mark)
  })
  root.normalize()
}
