import { describe, it, expect } from "vitest"
import {
  computeTabStatus,
  isDeployReady,
  isNameValid,
  isSystemPromptValid,
  isModelValid,
  type CompletenessFormState,
} from "./completeness"

const empty: CompletenessFormState = {
  name: "",
  description: "",
  systemPrompt: "",
  model: "",
  openingMessage: "",
  openingQuestions: [],
  liveChatEnabled: false,
  selectedToolIds: [],
  selectedSkillIds: [],
  selectedMcpServerIds: [],
  selectedWorkflowIds: [],
  useKnowledgeBase: false,
  knowledgeBaseGroupIds: [],
  memoryConfig: {},
  modelConfig: {},
  chatConfig: {},
  guardRails: {},
  availableModelIds: ["openai/gpt-5.2"],
}

describe("field predicates", () => {
  it("isNameValid requires non-empty trimmed string", () => {
    expect(isNameValid("")).toBe(false)
    expect(isNameValid("   ")).toBe(false)
    expect(isNameValid("My Agent")).toBe(true)
  })

  it("isSystemPromptValid requires 20+ chars trimmed", () => {
    expect(isSystemPromptValid("short")).toBe(false)
    expect(isSystemPromptValid("x".repeat(19))).toBe(false)
    expect(isSystemPromptValid("x".repeat(20))).toBe(true)
  })

  it("isModelValid requires id in availableModelIds", () => {
    expect(isModelValid("", [])).toBe(false)
    expect(isModelValid("openai/gpt-5.2", ["openai/gpt-5.2"])).toBe(true)
    expect(isModelValid("unknown", ["openai/gpt-5.2"])).toBe(false)
  })
})

describe("computeTabStatus", () => {
  it("configure is required-missing when name or prompt empty", () => {
    expect(computeTabStatus(empty, "configure")).toBe("required-missing")
  })

  it("model is required-missing when model empty or invalid", () => {
    expect(computeTabStatus(empty, "model")).toBe("required-missing")
    expect(
      computeTabStatus({ ...empty, model: "openai/gpt-5.2" }, "model")
    ).toBe("filled")
  })

  it("tools/skills/mcp/workflows are filled when any selected, else empty", () => {
    expect(computeTabStatus(empty, "tools")).toBe("empty")
    expect(
      computeTabStatus({ ...empty, selectedToolIds: ["t1"] }, "tools")
    ).toBe("filled")
  })

  it("knowledge is filled when useKnowledgeBase+groups non-empty", () => {
    expect(
      computeTabStatus(
        { ...empty, useKnowledgeBase: true, knowledgeBaseGroupIds: ["g1"] },
        "knowledge"
      )
    ).toBe("filled")
    expect(computeTabStatus(empty, "knowledge")).toBe("empty")
  })

  it("configure is filled when name + 20-char prompt present", () => {
    const form = { ...empty, name: "Agent", systemPrompt: "x".repeat(20) }
    expect(computeTabStatus(form, "configure")).toBe("filled")
  })
})

describe("isDeployReady", () => {
  it("reports missing required fields", () => {
    const r = isDeployReady(empty)
    expect(r.ok).toBe(false)
    expect(r.missing).toEqual(
      expect.arrayContaining(["name", "systemPrompt", "model"])
    )
  })

  it("passes when required fields filled", () => {
    const form: CompletenessFormState = {
      ...empty,
      name: "Agent",
      systemPrompt: "x".repeat(20),
      model: "openai/gpt-5.2",
    }
    expect(isDeployReady(form).ok).toBe(true)
  })

  it("requires openingMessage when liveChatEnabled", () => {
    const form: CompletenessFormState = {
      ...empty,
      name: "Agent",
      systemPrompt: "x".repeat(20),
      model: "openai/gpt-5.2",
      liveChatEnabled: true,
      openingMessage: "",
    }
    const r = isDeployReady(form)
    expect(r.ok).toBe(false)
    expect(r.missing).toContain("openingMessage")
  })
})
