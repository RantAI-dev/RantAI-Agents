import { describe, it, expect, vi } from "vitest"

// Mock heavy dependencies before importing the module
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/socket", () => ({ getIOInstance: vi.fn().mockReturnValue(null) }))
vi.mock("@/lib/workflow/nodes/trigger", () => ({ executeTrigger: vi.fn() }))
vi.mock("@/lib/workflow/nodes/agent", () => ({ executeAgent: vi.fn() }))
vi.mock("@/lib/workflow/nodes/llm", () => ({ executeLlm: vi.fn() }))
vi.mock("@/lib/workflow/nodes/tool", () => ({ executeTool: vi.fn() }))
vi.mock("@/lib/workflow/nodes/condition", () => ({ executeCondition: vi.fn() }))
vi.mock("@/lib/workflow/nodes/loop", () => ({ executeLoop: vi.fn() }))
vi.mock("@/lib/workflow/nodes/human", () => ({ executeHuman: vi.fn() }))
vi.mock("@/lib/workflow/nodes/data", () => ({ executeData: vi.fn() }))
vi.mock("@/lib/workflow/nodes/integration", () => ({ executeIntegration: vi.fn() }))
vi.mock("@/lib/workflow/nodes/stream", () => ({ executeStreamOutput: vi.fn() }))
vi.mock("@/lib/workflow/nodes/error-handler", () => ({ executeErrorHandler: vi.fn() }))
vi.mock("@/lib/workflow/nodes/sub-workflow", () => ({ executeSubWorkflow: vi.fn() }))

import { extractTokenUsage } from "@/lib/workflow/engine"

describe("extractTokenUsage", () => {
  it("extracts usage from a valid output object", () => {
    const output = { usage: { promptTokens: 100, completionTokens: 50 } }
    const result = extractTokenUsage(output)
    expect(result).toEqual({ promptTokens: 100, completionTokens: 50, totalTokens: 150 })
  })

  it("returns undefined for null", () => {
    expect(extractTokenUsage(null)).toBeUndefined()
  })

  it("returns undefined for undefined", () => {
    expect(extractTokenUsage(undefined)).toBeUndefined()
  })

  it("returns undefined for a string", () => {
    expect(extractTokenUsage("string")).toBeUndefined()
  })

  it("returns undefined for a number", () => {
    expect(extractTokenUsage(42)).toBeUndefined()
  })

  it("returns undefined when no usage field", () => {
    expect(extractTokenUsage({ someOtherField: 123 })).toBeUndefined()
  })

  it("returns undefined when both tokens are 0", () => {
    const output = { usage: { promptTokens: 0, completionTokens: 0 } }
    expect(extractTokenUsage(output)).toBeUndefined()
  })

  it("handles missing completionTokens (defaults to 0)", () => {
    const output = { usage: { promptTokens: 100 } }
    const result = extractTokenUsage(output)
    expect(result).toEqual({ promptTokens: 100, completionTokens: 0, totalTokens: 100 })
  })

  it("handles non-number token values as 0", () => {
    const output = { usage: { promptTokens: "not-a-number", completionTokens: null } }
    // Both are non-numbers → treated as 0 → returns undefined (special case: both 0)
    expect(extractTokenUsage(output)).toBeUndefined()
  })

  it("calculates totalTokens correctly for large values (1000+2000=3000)", () => {
    const output = { usage: { promptTokens: 1000, completionTokens: 2000 } }
    const result = extractTokenUsage(output)
    expect(result).toEqual({ promptTokens: 1000, completionTokens: 2000, totalTokens: 3000 })
  })
})

describe("NODE_HANDLERS", () => {
  it("engine module exports expected functions", async () => {
    const engineModule = await import("@/lib/workflow/engine")
    expect(engineModule.extractTokenUsage).toBeDefined()
    expect(engineModule.emitWorkflowEvent).toBeDefined()
  })
})
