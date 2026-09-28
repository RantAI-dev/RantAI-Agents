// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

const { assistantToolFindMany, assistantWorkflowFindMany, llmModelFindFirst } = vi.hoisted(() => ({
  assistantToolFindMany: vi.fn(),
  assistantWorkflowFindMany: vi.fn(),
  llmModelFindFirst: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    assistantTool: { findMany: assistantToolFindMany },
    assistantWorkflow: { findMany: assistantWorkflowFindMany },
    assistantMcpServer: { findMany: vi.fn().mockResolvedValue([]) },
    llmModel: { findFirst: llmModelFindFirst, findMany: vi.fn().mockResolvedValue([]) },
  },
}))
vi.mock("@/lib/skills/gateway", () => ({ getCommunityTool: vi.fn(), executeCommunityTool: vi.fn() }))
vi.mock("@/lib/skill-sdk", () => ({}))
vi.mock("@/lib/workflow", () => ({ workflowEngine: {} }))

import { resolveToolsForAssistant } from "@/lib/tools/registry"

// Found re-testing QA CHAT-037 in the running app: the registry's private
// model lookup did not know the house models, so an assistant on the default
// model (rantai/nano) got none of its bound tools.
describe("resolveToolsForAssistant on a house model", () => {
  beforeEach(() => {
    llmModelFindFirst.mockResolvedValue(null) // house models are not DB rows
    assistantWorkflowFindMany.mockResolvedValue([])
    assistantToolFindMany.mockResolvedValue([
      {
        enabled: true,
        tool: {
          id: "t1",
          name: "notify_team",
          description: "Notify the team",
          category: "custom",
          enabled: true,
          parameters: { type: "object", properties: {} },
          executionConfig: { url: "https://example.com/", method: "GET" },
          mcpServer: null,
        },
      },
    ])
  })

  it("resolves bound tools for rantai/nano", async () => {
    const { toolNames } = await resolveToolsForAssistant("a1", "rantai/nano", { userId: "u1" })
    expect(toolNames).toEqual(["notify_team"])
  })

  it("still returns nothing for an unknown model (control)", async () => {
    const { toolNames } = await resolveToolsForAssistant("a1", "nobody/unknown-model", { userId: "u1" })
    expect(toolNames).toEqual([])
  })
})
