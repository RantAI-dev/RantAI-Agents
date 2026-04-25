import { describe, it, expect } from "vitest"
import { mermaidToSvg } from "@/lib/rendering/server/mermaid-to-svg"

describe("server mermaidToSvg — concurrency", () => {
  it("handles 3 concurrent renders without leaking globals", async () => {
    // Without serialization, two concurrent calls would race on globalThis.window
    // (each one swaps, awaits import, and the second swap can clobber the first
    // mid-render). Verify that all 3 renders complete, each produces a valid SVG,
    // and globalThis.window is restored cleanly after all calls return.
    const beforeWindow = (globalThis as { window?: unknown }).window

    const results = await Promise.all([
      mermaidToSvg("flowchart TD\n  Alpha --> Beta"),
      mermaidToSvg("flowchart TD\n  Gamma --> Delta"),
      mermaidToSvg("flowchart TD\n  Epsilon --> Zeta"),
    ])

    expect(results).toHaveLength(3)
    for (const svg of results) {
      expect(svg).toMatch(/^<svg[\s>]/)
      expect(svg).toContain("</svg>")
    }

    // Each SVG should reflect its own input (not someone else's nodes).
    // jsdom doesn't render <text> content, so we match on the edge id which
    // mermaid synthesizes from the source node names.
    expect(results[0]).toContain("L_Alpha_Beta_")
    expect(results[1]).toContain("L_Gamma_Delta_")
    expect(results[2]).toContain("L_Epsilon_Zeta_")

    const afterWindow = (globalThis as { window?: unknown }).window
    expect(afterWindow).toBe(beforeWindow)
  })

  it("recovers cleanly after a failed render in the middle of a batch", async () => {
    const beforeWindow = (globalThis as { window?: unknown }).window

    const settled = await Promise.allSettled([
      mermaidToSvg("flowchart TD\n  One --> Two"),
      mermaidToSvg("not a valid diagram declaration"),
      mermaidToSvg("flowchart TD\n  Three --> Four"),
    ])

    expect(settled[0].status).toBe("fulfilled")
    expect(settled[1].status).toBe("rejected")
    expect(settled[2].status).toBe("fulfilled")

    const afterWindow = (globalThis as { window?: unknown }).window
    expect(afterWindow).toBe(beforeWindow)
  })
})
