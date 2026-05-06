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

  it("returns 'dom' when CSS Custom Highlight API is unavailable", () => {
    const matches = findMatches(host.textContent ?? "", "world")
    const mode = applyHighlights(host, matches, host.textContent ?? "")
    expect(mode).toBe("dom")
    const marks = host.querySelectorAll("mark.code-search-match")
    expect(marks).toHaveLength(1)
    expect(marks[0].textContent).toBe("world")
  })

  it("wraps each match in DOM mode without disturbing surrounding text", () => {
    const matches = findMatches(host.textContent ?? "", "foo")
    applyHighlights(host, matches, host.textContent ?? "")
    expect(host.textContent).toBe("hello world\nbar foo")
    const marks = host.querySelectorAll("mark.code-search-match")
    expect(marks).toHaveLength(1)
  })

  it("clearHighlights restores the host to its pre-highlight state", () => {
    const matches = findMatches(host.textContent ?? "", "world")
    const mode = applyHighlights(host, matches, host.textContent ?? "")
    clearHighlights(host, mode)
    expect(host.querySelectorAll("mark.code-search-match")).toHaveLength(0)
    expect(host.textContent).toBe("hello world\nbar foo")
  })

  it("returns null and applies no marks when there are no matches", () => {
    const mode = applyHighlights(host, [], host.textContent ?? "")
    expect(mode).toBeNull()
    expect(host.querySelectorAll("mark.code-search-match")).toHaveLength(0)
  })
})
