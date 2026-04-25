// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest"

const { resolveImagesMock, resolveSlideImagesMock } = vi.hoisted(() => ({
  resolveImagesMock: vi.fn(),
  resolveSlideImagesMock: vi.fn(),
}))

vi.mock("@/lib/unsplash", () => ({
  resolveImages: resolveImagesMock,
  resolveSlideImages: resolveSlideImagesMock,
}))

import { validateArtifactContent } from "@/lib/tools/builtin/_validate-artifact"

beforeEach(() => {
  resolveImagesMock.mockReset()
  resolveSlideImagesMock.mockReset()
})

describe("validateArtifactContent — embedded Unsplash resolution", () => {
  it("returns resolved content for text/html artifacts", async () => {
    resolveImagesMock.mockImplementation(async (s: string) =>
      s.replace(/unsplash:[^"]+/g, "https://example.com/cat.jpg"),
    )
    const html = `<!doctype html><html><head><title>x</title><meta name="viewport" content="x"></head><body><img src="unsplash:cat" alt="cat"></body></html>`

    const result = await validateArtifactContent("text/html", html)

    expect(result.ok).toBe(true)
    expect(resolveImagesMock).toHaveBeenCalledWith(html)
    expect(result.content).toContain("https://example.com/cat.jpg")
    expect(result.content).not.toContain("unsplash:")
  })

  it("returns resolved content for application/slides artifacts", async () => {
    resolveSlideImagesMock.mockImplementation(async (s: string) =>
      s.replace(/"unsplash:[^"]+"/g, '"https://example.com/photo.jpg"'),
    )
    const slides = JSON.stringify({
      theme: { primaryColor: "#0F172A", secondaryColor: "#3B82F6", fontFamily: "Inter" },
      slides: [
        { layout: "title", title: "Hi", subtitle: "Subt" },
        { layout: "image", imageUrl: "unsplash:mountain", title: "Pic" },
      ],
    })

    const result = await validateArtifactContent("application/slides", slides)

    expect(resolveSlideImagesMock).toHaveBeenCalledWith(slides)
    expect(result.content).toContain("https://example.com/photo.jpg")
    expect(result.content).not.toContain("unsplash:mountain")
  })

  it("does not call image resolvers for non-image artifact types", async () => {
    await validateArtifactContent("application/code", "console.log('hi')")
    expect(resolveImagesMock).not.toHaveBeenCalled()
    expect(resolveSlideImagesMock).not.toHaveBeenCalled()
  })

  it("does not run Unsplash resolution when validation fails (no rewrite of broken content)", async () => {
    // Missing DOCTYPE — validateHtml will reject.
    const broken = `<html><body></body></html>`
    const result = await validateArtifactContent("text/html", broken)
    expect(result.ok).toBe(false)
    expect(resolveImagesMock).not.toHaveBeenCalled()
  })
})
