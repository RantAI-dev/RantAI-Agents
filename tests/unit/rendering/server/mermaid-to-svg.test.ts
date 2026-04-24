import { describe, it, expect } from "vitest"
import { mermaidToSvg } from "@/lib/rendering/server/mermaid-to-svg"

describe("server mermaidToSvg", () => {
  it("renders a simple flowchart to an SVG string", async () => {
    const svg = await mermaidToSvg(`flowchart TD\n  A --> B`)
    expect(svg).toMatch(/^<svg[\s>]/)
    expect(svg).toContain("</svg>")
    expect(svg).toContain(">A<")
    expect(svg).toContain(">B<")
  })

  it("renders a sequenceDiagram", async () => {
    const svg = await mermaidToSvg(`sequenceDiagram\n  Alice->>Bob: Hi`)
    expect(svg).toMatch(/^<svg/)
    expect(svg).toContain(">Alice<")
    expect(svg).toContain(">Bob<")
  })

  it("throws on parse error", async () => {
    await expect(mermaidToSvg(`not a diagram`)).rejects.toBeTruthy()
  })

  it("restores globals after render (no leaked window)", async () => {
    const before = (globalThis as { window?: unknown }).window
    await mermaidToSvg(`flowchart TD\n  A --> B`)
    const after = (globalThis as { window?: unknown }).window
    expect(after).toBe(before)
  })
})
