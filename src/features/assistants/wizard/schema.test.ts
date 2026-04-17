import { describe, it, expect } from "vitest"
import {
  WizardMessageSchema,
  WizardDraftSchema,
  ProposeAgentInputSchema,
} from "./schema"

describe("WizardMessageSchema", () => {
  it("accepts user text messages", () => {
    const ok = WizardMessageSchema.safeParse({
      id: "m1",
      role: "user",
      content: "hi",
    })
    expect(ok.success).toBe(true)
  })
})

describe("WizardDraftSchema", () => {
  it("accepts fully-empty draft", () => {
    const r = WizardDraftSchema.safeParse({
      selectedToolIds: [],
      selectedSkillIds: [],
      selectedMcpServerIds: [],
      selectedWorkflowIds: [],
      knowledgeBaseGroupIds: [],
    })
    expect(r.success).toBe(true)
  })
})

describe("ProposeAgentInputSchema", () => {
  it("requires name + systemPrompt", () => {
    const bad = ProposeAgentInputSchema.safeParse({ name: "" })
    expect(bad.success).toBe(false)
  })
})
