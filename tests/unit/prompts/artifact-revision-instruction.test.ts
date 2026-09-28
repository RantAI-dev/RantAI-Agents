import { describe, expect, it } from "vitest"
import { buildToolInstruction } from "@/lib/prompts/instructions"

// QA TC-809: three revisions of one button ("Tombol Biru" → "Tombol Merah" →
// "Tombol Merah Klik Saya") became three separate v1 artifacts. The model had
// no artifact id to update, and type-specific canvas mode told it it MUST
// call create_artifact on every turn.
describe("buildToolInstruction — artifact revisions", () => {
  const tools = ["create_artifact", "update_artifact"]
  const existing = [{ id: "art_1", title: "Tombol Biru", type: "text/html" }]

  it("lists existing artifacts with ids and routes revisions to update_artifact", () => {
    const text = buildToolInstruction(tools, { canvasMode: "text/html", existingArtifacts: existing })
    expect(text).toContain('"Tombol Biru" (text/html) id="art_1"')
    expect(text).toMatch(/REVISION: call update_artifact with its id/)
  })

  it("no longer forces create_artifact in type-specific canvas mode", () => {
    const text = buildToolInstruction(tools, { canvasMode: "text/html", existingArtifacts: existing })
    expect(text).not.toMatch(/You MUST use the create_artifact tool/)
    expect(text).toMatch(/update_artifact when the user is revising/)
  })

  it("targets the viewed artifact when its type matches the canvas type", () => {
    const text = buildToolInstruction(tools, {
      canvasMode: "text/html",
      targetArtifactId: "art_1",
      existingArtifacts: existing,
    })
    expect(text).toContain('use update_artifact with id="art_1"')
  })

  it("asks for a new artifact when the canvas type differs from the viewed one (control)", () => {
    const text = buildToolInstruction(tools, {
      canvasMode: "application/react",
      targetArtifactId: "art_1",
      existingArtifacts: existing,
    })
    expect(text).toContain('Use create_artifact with type="application/react"')
    expect(text).not.toContain('use update_artifact with id="art_1"')
  })

  it("adds no artifact list when there are none", () => {
    const text = buildToolInstruction(tools, { canvasMode: "text/html" })
    expect(text).not.toContain("Artifacts already in this conversation")
  })
})
