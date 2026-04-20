import { describe, expect, it } from "vitest"
import { hashMermaidInput } from "./mermaid-cache"

const base = {
  source: "flowchart TD\n  A --> B",
  theme: "default-v1",
  width: 1200,
  height: 700,
  mermaidVersion: "11.12.2",
}

describe("hashMermaidInput", () => {
  it("returns a 64-character lowercase hex digest", async () => {
    const hash = await hashMermaidInput(base)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it("is stable across calls with identical input", async () => {
    const a = await hashMermaidInput(base)
    const b = await hashMermaidInput({ ...base })
    expect(a).toBe(b)
  })

  it("changes when the source changes", async () => {
    const a = await hashMermaidInput(base)
    const b = await hashMermaidInput({ ...base, source: base.source + " " })
    expect(a).not.toBe(b)
  })

  it("changes when the theme key changes", async () => {
    const a = await hashMermaidInput(base)
    const b = await hashMermaidInput({ ...base, theme: "default-v2" })
    expect(a).not.toBe(b)
  })

  it("changes when width changes", async () => {
    const a = await hashMermaidInput(base)
    const b = await hashMermaidInput({ ...base, width: base.width + 1 })
    expect(a).not.toBe(b)
  })

  it("changes when height changes", async () => {
    const a = await hashMermaidInput(base)
    const b = await hashMermaidInput({ ...base, height: base.height + 1 })
    expect(a).not.toBe(b)
  })

  it("changes when mermaidVersion changes", async () => {
    const a = await hashMermaidInput(base)
    const b = await hashMermaidInput({ ...base, mermaidVersion: "12.0.0" })
    expect(a).not.toBe(b)
  })

  it("distinguishes field boundaries (NUL separator, not concatenation)", async () => {
    // If we naively concatenated without a separator, these two inputs
    // would hash identically. The NUL separator must make them different.
    const a = await hashMermaidInput({
      ...base,
      source: "foo",
      theme: "bar",
    })
    const b = await hashMermaidInput({
      ...base,
      source: "foob",
      theme: "ar",
    })
    expect(a).not.toBe(b)
  })
})
