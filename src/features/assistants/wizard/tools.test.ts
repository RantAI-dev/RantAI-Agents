import { describe, it, expect } from "vitest"
import { buildWizardTools, filterKnownIds } from "./tools"

describe("filterKnownIds", () => {
  it("drops unknown IDs", () => {
    const { kept, dropped } = filterKnownIds(
      ["a", "b", "c"],
      new Set(["a", "c"])
    )
    expect(kept).toEqual(["a", "c"])
    expect(dropped).toEqual(["b"])
  })
})

describe("buildWizardTools", () => {
  it("exposes all 7 tools", () => {
    const tools = buildWizardTools({
      orgId: "o1",
      userId: "u1",
      deps: {
        listModels: async () => [],
        listTools: async () => [],
        listSkills: async () => [],
        listMcpServers: async () => [],
        listKnowledgeGroups: async () => [],
      },
    })
    expect(Object.keys(tools).sort()).toEqual(
      [
        "listKnowledgeGroups",
        "listMcpServers",
        "listModels",
        "listSkills",
        "listTools",
        "proposeAgent",
        "refineAgent",
      ].sort()
    )
  })
})
