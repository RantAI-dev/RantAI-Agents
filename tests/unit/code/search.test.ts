// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest"
import {
  findMatches,
  applyHighlights,
  clearHighlights,
} from "@/features/conversations/components/chat/artifacts/renderers/code/lib/search"

describe("findMatches", () => {
  it("returns no matches for an empty query", () => {
    expect(findMatches("hello world", "")).toEqual([])
  })

  it("returns no matches when the query is not present", () => {
    expect(findMatches("hello world", "xyz")).toEqual([])
  })

  it("returns a single-line match with correct positions", () => {
    const matches = findMatches("hello world", "world")
    expect(matches).toHaveLength(1)
    expect(matches[0]).toEqual({ startLine: 1, startCol: 6, endLine: 1, endCol: 11 })
  })

  it("matches across multiple lines and reports them separately", () => {
    const content = "foo\nbar\nfoo bar"
    const matches = findMatches(content, "foo")
    expect(matches).toHaveLength(2)
    expect(matches[0]).toEqual({ startLine: 1, startCol: 0, endLine: 1, endCol: 3 })
    expect(matches[1]).toEqual({ startLine: 3, startCol: 0, endLine: 3, endCol: 3 })
  })

  it("is case-insensitive", () => {
    const matches = findMatches("Hello World", "world")
    expect(matches).toHaveLength(1)
    expect(matches[0]).toEqual({ startLine: 1, startCol: 6, endLine: 1, endCol: 11 })
  })

  it("returns overlapping matches as separate non-overlapping hits", () => {
    const matches = findMatches("aaaa", "aa")
    expect(matches).toHaveLength(2)
  })
})

describe("applyHighlights / clearHighlights (DOM fallback)", () => {
  let host: HTMLElement

  beforeEach(() => {
    host = document.createElement("div")
    host.textContent = "hello world\nbar foo"
    document.body.appendChild(host)
  })

  it("returns mode 'dom' when CSS Custom Highlight API is unavailable", () => {
    const matches = findMatches(host.textContent ?? "", "world")
    const result = applyHighlights(host, matches, host.textContent ?? "")
    expect(result?.mode).toBe("dom")
    const marks = host.querySelectorAll("mark.code-search-match, mark.code-search-match-current")
    expect(marks).toHaveLength(1)
    expect(marks[0].textContent).toBe("world")
  })

  it("wraps each match in DOM mode without disturbing surrounding text", () => {
    const matches = findMatches(host.textContent ?? "", "foo")
    applyHighlights(host, matches, host.textContent ?? "")
    expect(host.textContent).toBe("hello world\nbar foo")
    const marks = host.querySelectorAll("mark.code-search-match, mark.code-search-match-current")
    expect(marks).toHaveLength(1)
  })

  it("uses the current-match class for the match at currentMatchIndex", () => {
    host.textContent = "foo foo foo"
    const matches = findMatches(host.textContent ?? "", "foo")
    expect(matches).toHaveLength(3)
    const result = applyHighlights(host, matches, host.textContent ?? "", 1)
    expect(result?.mode).toBe("dom")
    expect(host.querySelectorAll("mark.code-search-match-current")).toHaveLength(1)
    expect(host.querySelectorAll("mark.code-search-match")).toHaveLength(2)
    expect(result?.currentRange).not.toBeNull()
  })

  it("treats all matches the same when currentMatchIndex is out of range", () => {
    host.textContent = "foo foo"
    const matches = findMatches(host.textContent ?? "", "foo")
    applyHighlights(host, matches, host.textContent ?? "", 99)
    expect(host.querySelectorAll("mark.code-search-match-current")).toHaveLength(0)
    expect(host.querySelectorAll("mark.code-search-match")).toHaveLength(2)
  })

  it("clearHighlights restores the host to its pre-highlight state", () => {
    const matches = findMatches(host.textContent ?? "", "world")
    const result = applyHighlights(host, matches, host.textContent ?? "")
    clearHighlights(host, result?.mode ?? null)
    expect(host.querySelectorAll("mark.code-search-match, mark.code-search-match-current")).toHaveLength(0)
    expect(host.textContent).toBe("hello world\nbar foo")
  })

  it("returns null and applies no marks when there are no matches", () => {
    const result = applyHighlights(host, [], host.textContent ?? "")
    expect(result).toBeNull()
    expect(host.querySelectorAll("mark.code-search-match, mark.code-search-match-current")).toHaveLength(0)
  })
})
