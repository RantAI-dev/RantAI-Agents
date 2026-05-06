import { describe, it, expect } from "vitest"
import {
  ARCHIVED_SENTINEL,
  computeUnifiedDiff,
  computeSplitDiff,
} from "@/features/conversations/components/chat/artifacts/renderers/code/lib/diff"

describe("ARCHIVED_SENTINEL", () => {
  it("is a stable string unlikely to appear in real code", () => {
    expect(ARCHIVED_SENTINEL).toMatch(/ARTIFACT_VERSION_ARCHIVED/)
    expect(ARCHIVED_SENTINEL.length).toBeGreaterThan(8)
  })
})

describe("computeUnifiedDiff", () => {
  it("reports identical when both sides are byte-equal", () => {
    const result = computeUnifiedDiff("foo\nbar\n", "foo\nbar\n")
    expect(result.kind).toBe("ok")
    if (result.kind === "ok") expect(result.identical).toBe(true)
  })

  it("returns archived when before is the sentinel", () => {
    const result = computeUnifiedDiff(ARCHIVED_SENTINEL, "foo\nbar\n")
    expect(result.kind).toBe("archived")
  })

  it("emits added/removed/context lines with correct numbering", () => {
    const before = "a\nb\nc\n"
    const after = "a\nB\nc\n"
    const result = computeUnifiedDiff(before, after)
    expect(result.kind).toBe("ok")
    if (result.kind !== "ok" || result.identical) throw new Error("unexpected")
    const lines = result.lines
    expect(lines[0]).toMatchObject({ kind: "context", text: "a", beforeLineNum: 1, afterLineNum: 1 })
    const removed = lines.find((l) => l.kind === "removed")
    expect(removed).toMatchObject({ text: "b", beforeLineNum: 2, afterLineNum: null })
    const added = lines.find((l) => l.kind === "added")
    expect(added).toMatchObject({ text: "B", beforeLineNum: null, afterLineNum: 2 })
    const last = lines[lines.length - 1]
    expect(last).toMatchObject({ kind: "context", text: "c", beforeLineNum: 3, afterLineNum: 3 })
  })

  it("handles addition-only diffs", () => {
    const result = computeUnifiedDiff("a\n", "a\nb\n")
    if (result.kind !== "ok" || result.identical) throw new Error("unexpected")
    const added = result.lines.filter((l) => l.kind === "added")
    expect(added).toHaveLength(1)
    expect(added[0]).toMatchObject({ text: "b", afterLineNum: 2 })
  })

  it("handles removal-only diffs", () => {
    const result = computeUnifiedDiff("a\nb\n", "a\n")
    if (result.kind !== "ok" || result.identical) throw new Error("unexpected")
    const removed = result.lines.filter((l) => l.kind === "removed")
    expect(removed).toHaveLength(1)
    expect(removed[0]).toMatchObject({ text: "b", beforeLineNum: 2 })
  })

  it("handles empty before vs non-empty after", () => {
    const result = computeUnifiedDiff("", "hello\n")
    if (result.kind !== "ok" || result.identical) throw new Error("unexpected")
    expect(result.lines.every((l) => l.kind === "added")).toBe(true)
  })

  it("preserves multibyte text in line content", () => {
    const result = computeUnifiedDiff("héllo\n", "héllo wörld\n")
    if (result.kind !== "ok" || result.identical) throw new Error("unexpected")
    expect(result.lines.find((l) => l.text.includes("wörld"))?.kind).toBe("added")
  })

  it("handles 200-line very different inputs without throwing", () => {
    const before = Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\n")
    const after = Array.from({ length: 200 }, (_, i) => `LINE ${i}`).join("\n")
    const result = computeUnifiedDiff(before, after)
    expect(result.kind).toBe("ok")
    if (result.kind === "ok") expect(result.identical).toBe(false)
  })
})

describe("computeSplitDiff", () => {
  it("returns identical when both sides equal", () => {
    expect(computeSplitDiff("a\n", "a\n").kind).toBe("identical")
  })

  it("returns archived when before is the sentinel", () => {
    expect(computeSplitDiff(ARCHIVED_SENTINEL, "x\n").kind).toBe("archived")
  })

  it("aligns added lines on the right with empty padding on the left", () => {
    const result = computeSplitDiff("a\n", "a\nb\n")
    if (result.kind !== "ok") throw new Error("unexpected")
    expect(result.left).toHaveLength(result.right!.length)
    const lastLeft = result.left![result.left!.length - 1]
    const lastRight = result.right![result.right!.length - 1]
    expect(lastLeft.kind).toBe("context")
    expect(lastLeft.text).toBe("")
    expect(lastRight.kind).toBe("added")
  })

  it("aligns removed lines on the left with empty padding on the right", () => {
    const result = computeSplitDiff("a\nb\n", "a\n")
    if (result.kind !== "ok") throw new Error("unexpected")
    const lastLeft = result.left![result.left!.length - 1]
    const lastRight = result.right![result.right!.length - 1]
    expect(lastLeft.kind).toBe("removed")
    expect(lastRight.kind).toBe("context")
    expect(lastRight.text).toBe("")
  })
})
