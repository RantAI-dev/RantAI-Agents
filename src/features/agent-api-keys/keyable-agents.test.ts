import { describe, expect, it } from "vitest"
import type { Assistant } from "@/lib/types/assistant"
import { keyableAgents } from "./keyable-agents"

const agent = (id: string, isBuiltIn?: boolean): Assistant => ({
  id,
  name: id,
  description: "",
  emoji: "🤖",
  systemPrompt: "",
  useKnowledgeBase: false,
  createdAt: new Date(0),
  isBuiltIn,
})

describe("keyableAgents", () => {
  it("offers the organisation's agents and never a built-in, which Rust refuses", () => {
    expect(keyableAgents([agent("own"), agent("builtin", true), agent("legacy")]).map((a) => a.id)).toEqual([
      "own",
      "legacy",
    ])
  })
})

describe("the assistants list carries isBuiltIn through", () => {
  it("keeps the flag the API answers, so the filter above has something to read", async () => {
    const { mapDbAssistant } = await import("@/hooks/use-assistants")
    const row = {
      id: "b1",
      name: "Built-in",
      description: null,
      emoji: "🤖",
      systemPrompt: "",
      model: null,
      useKnowledgeBase: false,
      knowledgeBaseGroupIds: [],
      isSystemDefault: false,
      isBuiltIn: true,
      createdAt: "2026-11-14T00:00:00.000Z",
    }
    expect(mapDbAssistant(row as never).isBuiltIn).toBe(true)
    expect(keyableAgents([mapDbAssistant(row as never)])).toEqual([])
  })
})
