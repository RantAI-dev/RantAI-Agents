// @vitest-environment node
import { describe, it, expect } from "vitest"
import { assembleArtifactContext, DELIVERY_CONTRACT } from "@/lib/prompts/artifacts/context"
import { ALL_ARTIFACTS } from "@/lib/prompts/artifacts"
import { buildToolInstruction } from "@/lib/prompts/instructions"

describe("artifact delivery contract", () => {
  it("prefixes every full-mode spec with the delivery contract", () => {
    for (const a of ALL_ARTIFACTS) {
      const ctx = assembleArtifactContext(a.type, "full")
      expect(ctx.startsWith(DELIVERY_CONTRACT), a.type).toBe(true)
    }
  })

  it("is absent from summary mode (no type selected)", () => {
    expect(assembleArtifactContext(null, "summary")).not.toContain("Delivery Contract")
  })

  it("reaches the system prompt when a specific canvas type is active", () => {
    const instr = buildToolInstruction(["create_artifact", "update_artifact"], {
      canvasMode: "application/slides",
    })
    expect(instr).toContain("Delivery Contract")
    expect(instr).toContain('create_artifact tool with type="application/slides"')
  })

  it("no per-type rule tells the model what its *response* must be", () => {
    // These phrasings made weaker models paste the deck/script into the chat
    // reply instead of the tool argument.
    for (const a of ALL_ARTIFACTS) {
      expect(a.rules, a.type).not.toMatch(/## Output Format/)
      expect(a.rules, a.type).not.toMatch(/entire response must/i)
      expect(a.rules, a.type).not.toMatch(/^Output \*\*a single/m)
    }
  })
})
