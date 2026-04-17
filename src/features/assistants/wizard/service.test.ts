import { describe, it, expect } from "vitest"
import { buildWizardSystemPrompt, sanitizeProposal } from "./service"
import type { ProposeAgentInput } from "./schema"

describe("buildWizardSystemPrompt", () => {
  it("includes org context and rules", () => {
    const prompt = buildWizardSystemPrompt({
      organizationId: "org_1",
      userRole: "admin",
      existingAgentCount: 3,
      toolCount: 10,
      skillCount: 5,
      mcpCount: 2,
      kbCount: 1,
      modelCount: 4,
    })
    expect(prompt).toContain("org_1")
    expect(prompt).toContain("3 existing agents")
    expect(prompt).toContain("Never invent IDs")
    expect(prompt).toContain("proposeAgent")
  })
})

describe("sanitizeProposal", () => {
  const base: ProposeAgentInput = {
    name: "A",
    description: undefined,
    emoji: "🤖",
    tags: [],
    systemPrompt: "x".repeat(30),
    model: "openai/gpt-5.2",
    openingMessage: undefined,
    openingQuestions: [],
    liveChatEnabled: false,
    selectedToolIds: ["t1", "tX"],
    selectedSkillIds: ["s1"],
    selectedMcpServerIds: [],
    selectedWorkflowIds: [],
    useKnowledgeBase: false,
    knowledgeBaseGroupIds: ["kb1", "kbX"],
    uncertainty: {},
    reasoning: undefined,
  }

  it("drops unknown tool / kb IDs and unknown model", () => {
    const r = sanitizeProposal(base, {
      models: new Set(["openai/gpt-5.2"]),
      tools: new Set(["t1"]),
      skills: new Set(["s1"]),
      mcp: new Set(),
      kbs: new Set(["kb1"]),
    })
    expect(r.payload.selectedToolIds).toEqual(["t1"])
    expect(r.payload.knowledgeBaseGroupIds).toEqual(["kb1"])
    expect(r.payload.model).toBe("openai/gpt-5.2")
    expect(r.dropped.tools).toEqual(["tX"])
    expect(r.dropped.kbs).toEqual(["kbX"])
  })

  it("clears model when unknown", () => {
    const r = sanitizeProposal(base, {
      models: new Set(["other/model"]),
      tools: new Set(["t1"]),
      skills: new Set(["s1"]),
      mcp: new Set(),
      kbs: new Set(["kb1"]),
    })
    expect(r.payload.model).toBe("")
    expect(r.dropped.model).toEqual(["openai/gpt-5.2"])
  })
})
