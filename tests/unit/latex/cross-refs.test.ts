import { describe, it, expect } from "vitest"
import {
  scanLabels,
  resolveRef,
} from "@/features/conversations/components/chat/artifacts/renderers/latex/lib/cross-refs"

describe("scanLabels — single env", () => {
  it("registers a labeled theorem", () => {
    const reg = scanLabels(
      "\\begin{theorem}\n\\label{thm:mvt}\nbody\n\\end{theorem}",
    )
    const e = reg.get("thm:mvt")
    expect(e).toBeDefined()
    expect(e?.kind).toBe("theorem")
    expect(e?.number).toBe("1")
    expect(e?.anchorId).toBe("thm-mvt")
  })

  it("registers a labeled equation env", () => {
    const reg = scanLabels(
      "\\begin{equation}\n\\label{eq:foo}\nx = y\n\\end{equation}",
    )
    const e = reg.get("eq:foo")
    expect(e?.kind).toBe("equation")
    expect(e?.number).toBe("1")
    expect(e?.anchorId).toBe("eq-foo")
  })

  it("ignores label outside any numbered env", () => {
    const reg = scanLabels("\\label{stray:nothing}\n\\section{Hi}")
    expect(reg.has("stray:nothing")).toBe(false)
  })
})

describe("scanLabels — nested envs", () => {
  it("does not bleed an inner equation label up to the outer theorem", () => {
    const reg = scanLabels(
      [
        "\\begin{theorem}",
        "  body without outer label",
        "  \\begin{equation}\\label{eq:inner}\\end{equation}",
        "\\end{theorem}",
      ].join("\n"),
    )
    const eq = reg.get("eq:inner")
    expect(eq?.kind).toBe("equation")
    expect(eq?.number).toBe("1")
    expect(eq?.anchorId).toBe("eq-inner")
  })

  it("registers outer label when it appears before the nested env", () => {
    const reg = scanLabels(
      [
        "\\begin{theorem}",
        "\\label{thm:outer}",
        "  body",
        "  \\begin{equation}\\label{eq:inner}\\end{equation}",
        "\\end{theorem}",
      ].join("\n"),
    )
    expect(reg.get("thm:outer")?.kind).toBe("theorem")
    expect(reg.get("thm:outer")?.number).toBe("1")
    expect(reg.get("eq:inner")?.kind).toBe("equation")
    expect(reg.get("eq:inner")?.number).toBe("1")
  })

  it("registers a labeled multline equation", () => {
    const reg = scanLabels(
      "\\begin{multline}\\label{eq:long}\\end{multline}",
    )
    expect(reg.get("eq:long")?.kind).toBe("equation")
    expect(reg.get("eq:long")?.number).toBe("1")
  })
})

describe("scanLabels — counter pools", () => {
  it("theorem family shares one counter pool (amsthm convention)", () => {
    const reg = scanLabels(
      [
        "\\begin{theorem}\\label{thm:a}\\end{theorem}",
        "\\begin{lemma}\\label{thm:b}\\end{lemma}",
        "\\begin{corollary}\\label{thm:c}\\end{corollary}",
        "\\begin{proposition}\\label{thm:d}\\end{proposition}",
      ].join("\n"),
    )
    expect(reg.get("thm:a")?.number).toBe("1")
    expect(reg.get("thm:b")?.number).toBe("2")
    expect(reg.get("thm:c")?.number).toBe("3")
    expect(reg.get("thm:d")?.number).toBe("4")
  })

  it("definition has its own pool", () => {
    const reg = scanLabels(
      [
        "\\begin{theorem}\\label{thm:a}\\end{theorem}",
        "\\begin{definition}\\label{def:a}\\end{definition}",
      ].join("\n"),
    )
    expect(reg.get("thm:a")?.number).toBe("1")
    expect(reg.get("def:a")?.number).toBe("1")
  })

  it("equation pool is independent of theorem pool", () => {
    const reg = scanLabels(
      [
        "\\begin{theorem}\\label{thm:a}\\end{theorem}",
        "\\begin{equation}\\label{eq:a}\\end{equation}",
      ].join("\n"),
    )
    expect(reg.get("thm:a")?.number).toBe("1")
    expect(reg.get("eq:a")?.number).toBe("1")
  })

  it("starred envs do not increment counter", () => {
    const reg = scanLabels(
      [
        "\\begin{equation*}\\end{equation*}",
        "\\begin{equation}\\label{eq:numbered}\\end{equation}",
      ].join("\n"),
    )
    expect(reg.get("eq:numbered")?.number).toBe("1")
  })
})

describe("resolveRef", () => {
  const reg = scanLabels(
    [
      "\\begin{theorem}\\label{thm:mvt}\\end{theorem}",
      "\\begin{equation}\\label{eq:foo}\\end{equation}",
    ].join("\n"),
  )

  it("\\ref renders bare number with anchor", () => {
    const r = resolveRef(reg, "thm:mvt", "ref")
    expect(r).toEqual({ displayText: "1", anchorId: "thm-mvt" })
  })

  it("\\eqref renders parenthesized number", () => {
    const r = resolveRef(reg, "eq:foo", "eqref")
    expect(r).toEqual({ displayText: "(1)", anchorId: "eq-foo" })
  })

  it("returns null for unknown key", () => {
    expect(resolveRef(reg, "thm:missing", "ref")).toBeNull()
  })
})
