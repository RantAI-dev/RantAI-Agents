import { describe, it, expect } from "vitest"
import {
  isTheoremBegin,
  renderTheoremBlock,
  THEOREM_KINDS,
  type TheoremKind,
} from "@/features/conversations/components/chat/artifacts/renderers/latex/lib/theorem-envs"

describe("theorem-envs — kind recognition", () => {
  it("recognizes \\begin{theorem}", () => {
    const r = isTheoremBegin("\\begin{theorem}")
    expect(r).toEqual({ kind: "theorem" })
  })

  it("recognizes \\begin{theorem}[Optional Name]", () => {
    const r = isTheoremBegin("\\begin{theorem}[Mean Value Theorem]")
    expect(r).toEqual({ kind: "theorem", optionalName: "Mean Value Theorem" })
  })

  it("recognizes all 8 kinds", () => {
    const kinds: TheoremKind[] = [
      "theorem", "lemma", "corollary", "proposition",
      "definition", "example", "remark", "proof",
    ]
    for (const k of kinds) {
      expect(isTheoremBegin(`\\begin{${k}}`)?.kind).toBe(k)
      expect(THEOREM_KINDS.has(k)).toBe(true)
    }
  })

  it("returns null for non-theorem envs", () => {
    expect(isTheoremBegin("\\begin{align}")).toBeNull()
    expect(isTheoremBegin("\\begin{itemize}")).toBeNull()
    expect(isTheoremBegin("regular text")).toBeNull()
  })
})

describe("theorem-envs — render", () => {
  it("renders theorem with number and inner HTML", () => {
    const html = renderTheoremBlock("theorem", "1", undefined, "<p>Body</p>", "thm-foo")
    expect(html).toMatch(/<aside id="thm-foo" class="latex-theorem latex-theorem-blue">/)
    expect(html).toMatch(/Theorem 1\./)
    expect(html).toContain("<p>Body</p>")
  })

  it("renders theorem with optional name", () => {
    const html = renderTheoremBlock("theorem", "2", "Pythagoras", "<p>Body</p>", null)
    expect(html).toMatch(/Theorem 2 \(Pythagoras\)\./)
  })

  it("renders unnumbered remark in italic gray", () => {
    const html = renderTheoremBlock("remark", null, undefined, "<p>Note</p>", null)
    expect(html).toMatch(/latex-theorem-gray/)
    expect(html).toMatch(/Remark\./)
    expect(html).not.toMatch(/Remark \d/)
  })

  it("renders proof with auto-appended QED mark", () => {
    const html = renderTheoremBlock("proof", null, undefined, "<p>Steps</p>", null)
    expect(html).toMatch(/Proof\./)
    expect(html).toMatch(/<span class="latex-qed">∎<\/span>/)
  })

  it("uses correct color per kind", () => {
    const map: Record<TheoremKind, string> = {
      theorem: "blue",
      lemma: "indigo",
      corollary: "teal",
      proposition: "sky",
      definition: "purple",
      example: "amber",
      remark: "gray",
      proof: "gray",
    }
    for (const [kind, color] of Object.entries(map) as [TheoremKind, string][]) {
      const html = renderTheoremBlock(kind, null, undefined, "", null)
      expect(html).toContain(`latex-theorem-${color}`)
    }
  })

  it("emits anchor id when supplied", () => {
    const html = renderTheoremBlock("lemma", "3", undefined, "", "thm-foo")
    expect(html).toContain('id="thm-foo"')
  })

  it("omits anchor id when null", () => {
    const html = renderTheoremBlock("lemma", "3", undefined, "", null)
    expect(html).not.toContain("id=")
  })
})
