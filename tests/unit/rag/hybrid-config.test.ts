import { describe, expect, it } from "vitest"
import { mergeHybridConfig } from "@/lib/rag/hybrid-search"

// Found re-testing QA CHAT-032/034: chat passes groupIds: undefined for
// "all documents", which replaced the default [] and crashed vector search,
// so the default path always fell back to vector-only retrieval.
describe("mergeHybridConfig", () => {
  it("keeps defaults when the caller passes undefined", () => {
    const cfg = mergeHybridConfig({ groupIds: undefined, categoryFilter: undefined })
    expect(cfg.groupIds).toEqual([])
    expect(cfg.categoryFilter).toBe("")
  })

  it("still applies explicit values (control)", () => {
    const cfg = mergeHybridConfig({ groupIds: ["g1"], finalTopK: 3 })
    expect(cfg.groupIds).toEqual(["g1"])
    expect(cfg.finalTopK).toBe(3)
  })
})
