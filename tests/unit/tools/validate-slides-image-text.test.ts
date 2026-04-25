// @vitest-environment node
import { describe, it, expect } from "vitest"
import { validateArtifactContent } from "@/lib/tools/builtin/_validate-artifact"

const baseDeck = {
  theme: { primaryColor: "#0F172A", secondaryColor: "#3B82F6", fontFamily: "Inter" },
  slides: [
    { layout: "title", title: "Hi", subtitle: "Sub" },
    { layout: "image-text", title: "Old layout", content: "still here" },
    { layout: "content", title: "Mid", content: "body" },
    { layout: "content", title: "Mid 2", content: "body 2" },
    { layout: "content", title: "Mid 3", content: "body 3" },
    { layout: "content", title: "Mid 4", content: "body 4" },
    { layout: "content", title: "Mid 5", content: "body 5" },
    { layout: "closing", title: "Bye" },
  ],
}

describe("validateSlides — image-text layout (isNew gate)", () => {
  it("warns but accepts image-text on UPDATE (isNew=false / omitted) — grandfathered", async () => {
    const result = await validateArtifactContent("application/slides", JSON.stringify(baseDeck))
    expect(result.ok).toBe(true)
    expect(result.warnings.some((w) => /image-text/i.test(w))).toBe(true)
  })

  it("rejects image-text on CREATE (isNew=true)", async () => {
    const result = await validateArtifactContent(
      "application/slides",
      JSON.stringify(baseDeck),
      { isNew: true },
    )
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => /image-text/i.test(e))).toBe(true)
  })

  it("accepts a deck without image-text on CREATE", async () => {
    const cleanDeck = {
      ...baseDeck,
      slides: baseDeck.slides.map((s) =>
        s.layout === "image-text" ? { ...s, layout: "content" } : s,
      ),
    }
    const result = await validateArtifactContent(
      "application/slides",
      JSON.stringify(cleanDeck),
      { isNew: true },
    )
    expect(result.ok).toBe(true)
  })
})
