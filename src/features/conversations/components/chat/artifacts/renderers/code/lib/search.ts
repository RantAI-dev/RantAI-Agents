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
const MARK_CLASS = "code-search-match"

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

/**
 * Apply highlights to `root` for the given `matches`. Returns the mode
 * used so the caller can pass the right value to `clearHighlights`. When
 * there are zero matches, returns `null` and does nothing.
 */
export function applyHighlights(
  root: HTMLElement,
  matches: SearchMatch[],
  content: string,
): HighlightMode | null {
  if (matches.length === 0) return null

  const ranges = buildRanges(root, matches, content)
  if (!ranges || ranges.length === 0) return null

  const api = getHighlightApi()
  if (api) {
    try {
      const highlight = new api.Highlight(...ranges) as unknown
      api.CSS.highlights!.set(HIGHLIGHT_NAME, highlight)
      return "css"
    } catch {
      // fall through to DOM mode
    }
  }

  // DOM fallback: wrap each range in a <mark>. Iterate from the end so
  // earlier ranges keep their offsets after surgery.
  for (let i = ranges.length - 1; i >= 0; i--) {
    const range = ranges[i]
    const mark = document.createElement("mark")
    mark.className = MARK_CLASS
    try {
      range.surroundContents(mark)
    } catch {
      // surroundContents fails on ranges that span element boundaries;
      // give up on this match rather than mutate broken DOM.
    }
  }
  return "dom"
}

/** Tear down highlights applied via `applyHighlights`. */
export function clearHighlights(root: HTMLElement, mode: HighlightMode | null): void {
  if (mode === null) return
  if (mode === "css") {
    const api = getHighlightApi()
    api?.CSS.highlights?.delete(HIGHLIGHT_NAME)
    return
  }
  const marks = root.querySelectorAll(`mark.${MARK_CLASS}`)
  marks.forEach((mark) => {
    const parent = mark.parentNode
    if (!parent) return
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
    parent.removeChild(mark)
  })
  root.normalize()
}
