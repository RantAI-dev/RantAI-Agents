import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest"
import { testPrisma, cleanupDatabase } from "../../helpers/db"
import {
  createTestUser,
  createTestOrg,
  createTestAssistant,
  createTestTool,
} from "../../helpers/fixtures"

// IMPORTANT: All mocks must be declared before importing the module under test

vi.mock("@/lib/prisma", () => ({ prisma: testPrisma }))

vi.mock("@/lib/tools/builtin", () => ({
  BUILTIN_TOOLS: {
    test_builtin: {
      execute: vi.fn().mockResolvedValue("builtin result"),
    },
  },
}))

vi.mock("@/lib/mcp/tool-adapter", () => ({
  adaptMcpToolsToAiSdk: vi.fn().mockReturnValue({}),
}))

vi.mock("@/lib/mcp/client", () => ({
  mcpClientManager: {
    listTools: vi.fn().mockResolvedValue([]),
    connect: vi.fn(),
    callTool: vi.fn(),
  },
}))

vi.mock("@/lib/models", () => {
  const AVAILABLE_MODELS = [
    {
      id: "test/model",
      name: "Test",
      provider: "test",
      description: "Test model",
      contextWindow: 4096,
      pricing: { input: 0, output: 0 },
      capabilities: { vision: false, functionCalling: true, streaming: true },
    },
    {
      id: "test/no-tools",
      name: "No Tools",
      provider: "test",
      description: "Test model without function calling",
      contextWindow: 4096,
      pricing: { input: 0, output: 0 },
      capabilities: { vision: false, functionCalling: false, streaming: true },
    },
  ]
  return {
    DEFAULT_MODEL_ID: "test/model",
    AVAILABLE_MODELS,
    getModelById: (id: string) => AVAILABLE_MODELS.find((m) => m.id === id),
  }
})

vi.mock("@/lib/skills/gateway", () => ({
  getCommunityTool: vi.fn(),
  executeCommunityTool: vi.fn(),
}))

vi.mock("@/lib/skill-sdk", () => ({}))

vi.mock("@/lib/workflow", () => ({
  workflowEngine: { executeWorkflow: vi.fn() },
}))

vi.mock("@/lib/workflow/credentials", () => ({
  decryptJsonField: vi.fn().mockReturnValue({}),
}))

// Import the module under test AFTER all mocks are set up
import { resolveToolsForAssistant } from "@/lib/tools/registry"

beforeAll(async () => {
  await testPrisma.$connect()
})

afterEach(async () => {
  await cleanupDatabase()
})

afterAll(async () => {
  await testPrisma.$disconnect()
})

describe("resolveToolsForAssistant", () => {
  it("returns empty tools when no tools are bound to the assistant", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    const assistant = await createTestAssistant(org.id, { model: "test/model" })

    const context = {
      userId: user.id,
      organizationId: org.id,
      sessionId: "sess1",
      assistantId: assistant.id,
    }

    const result = await resolveToolsForAssistant(assistant.id, "test/model", context)

    expect(result.tools).toEqual({})
    expect(result.toolNames).toEqual([])
  })

  it("returns empty tools when model lacks function calling capability", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    const assistant = await createTestAssistant(org.id, { model: "test/no-tools" })
    const tool = await createTestTool(org.id, {
      name: "test_builtin",
      category: "builtin",
      enabled: true,
    })

    await testPrisma.assistantTool.create({
      data: {
        assistantId: assistant.id,
        toolId: tool.id,
        enabled: true,
      },
    })

    const context = {
      userId: user.id,
      organizationId: org.id,
      sessionId: "sess1",
      assistantId: assistant.id,
    }

    const result = await resolveToolsForAssistant(assistant.id, "test/no-tools", context)

    expect(result.tools).toEqual({})
    expect(result.toolNames).toEqual([])
  })

  it("resolves builtin tools when enabled and bound to assistant", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    const assistant = await createTestAssistant(org.id, { model: "test/model" })
    const tool = await createTestTool(org.id, {
      name: "test_builtin",
      displayName: "Test Builtin",
      description: "A test builtin tool",
      category: "builtin",
      enabled: true,
    })

    await testPrisma.assistantTool.create({
      data: {
        assistantId: assistant.id,
        toolId: tool.id,
        enabled: true,
      },
    })

    const context = {
      userId: user.id,
      organizationId: org.id,
      sessionId: "sess1",
      assistantId: assistant.id,
    }

    const result = await resolveToolsForAssistant(assistant.id, "test/model", context)

    expect(result.toolNames).toContain("test_builtin")
    expect(result.tools["test_builtin"]).toBeDefined()
  })

  it("resolves custom tools with HTTP execution config", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    const assistant = await createTestAssistant(org.id, { model: "test/model" })
    const tool = await createTestTool(org.id, {
      name: "my_custom_tool",
      displayName: "My Custom Tool",
      description: "A custom HTTP tool",
      category: "custom",
      enabled: true,
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The query" },
        },
        required: ["query"],
      },
      executionConfig: {
        url: "https://example.com/api/tool",
        method: "POST",
        authType: "none",
      },
    })

    await testPrisma.assistantTool.create({
      data: {
        assistantId: assistant.id,
        toolId: tool.id,
        enabled: true,
      },
    })

    const context = {
      userId: user.id,
      organizationId: org.id,
      sessionId: "sess1",
      assistantId: assistant.id,
    }

    const result = await resolveToolsForAssistant(assistant.id, "test/model", context)

    expect(result.toolNames).toContain("my_custom_tool")
    expect(result.tools["my_custom_tool"]).toBeDefined()
  })

  it("skips disabled tool bindings (enabled: false)", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    const assistant = await createTestAssistant(org.id, { model: "test/model" })
    const tool = await createTestTool(org.id, {
      name: "test_builtin",
      displayName: "Test Builtin",
      description: "A test builtin tool",
      category: "builtin",
      enabled: true,
    })

    await testPrisma.assistantTool.create({
      data: {
        assistantId: assistant.id,
        toolId: tool.id,
        enabled: false, // disabled binding
      },
    })

    const context = {
      userId: user.id,
      organizationId: org.id,
      sessionId: "sess1",
      assistantId: assistant.id,
    }

    const result = await resolveToolsForAssistant(assistant.id, "test/model", context)

    expect(result.tools).toEqual({})
    expect(result.toolNames).toEqual([])
  })

  it("skips tools where the tool record itself is disabled", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    const assistant = await createTestAssistant(org.id, { model: "test/model" })
    const tool = await createTestTool(org.id, {
      name: "test_builtin",
      displayName: "Test Builtin",
      description: "A test builtin tool",
      category: "builtin",
      enabled: false, // tool record disabled
    })

    await testPrisma.assistantTool.create({
      data: {
        assistantId: assistant.id,
        toolId: tool.id,
        enabled: true,
      },
    })

    const context = {
      userId: user.id,
      organizationId: org.id,
      sessionId: "sess1",
      assistantId: assistant.id,
    }

    const result = await resolveToolsForAssistant(assistant.id, "test/model", context)

    expect(result.tools).toEqual({})
    expect(result.toolNames).toEqual([])
  })

  it("logs tool execution when a builtin tool is called", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    const assistant = await createTestAssistant(org.id, { model: "test/model" })
    const tool = await createTestTool(org.id, {
      name: "test_builtin",
      displayName: "Test Builtin",
      description: "A test builtin tool",
      category: "builtin",
      enabled: true,
    })

    await testPrisma.assistantTool.create({
      data: {
        assistantId: assistant.id,
        toolId: tool.id,
        enabled: true,
      },
    })

    const context = {
      userId: user.id,
      organizationId: org.id,
      sessionId: "sess1",
      assistantId: assistant.id,
    }

    const result = await resolveToolsForAssistant(assistant.id, "test/model", context)

    expect(result.tools["test_builtin"]).toBeDefined()

    // Execute the resolved tool to trigger logToolExecution
    const toolFn = result.tools["test_builtin"]
    await toolFn.execute?.({}, { messages: [], toolCallId: "test-call-1" })

    // Wait briefly for the async log to settle
    await new Promise((resolve) => setTimeout(resolve, 50))

    const execLogs = await testPrisma.toolExecution.findMany({
      where: { toolName: "test_builtin" },
    })

    expect(execLogs.length).toBeGreaterThanOrEqual(1)
    expect(execLogs[0].toolName).toBe("test_builtin")
    expect(execLogs[0].status).toBe("success")
    expect(execLogs[0].sessionId).toBe("sess1")
    expect(execLogs[0].assistantId).toBe(assistant.id)
    expect(execLogs[0].organizationId).toBe(org.id)
    expect(execLogs[0].userId).toBe(user.id)
  })

  it("skips custom tools that have no URL configured", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    const assistant = await createTestAssistant(org.id, { model: "test/model" })
    const tool = await createTestTool(org.id, {
      name: "no_url_tool",
      displayName: "No URL Tool",
      description: "Custom tool without URL",
      category: "custom",
      enabled: true,
      parameters: {
        type: "object",
        properties: {},
      },
      executionConfig: null, // no execution config
    })

    await testPrisma.assistantTool.create({
      data: {
        assistantId: assistant.id,
        toolId: tool.id,
        enabled: true,
      },
    })

    const context = {
      userId: user.id,
      organizationId: org.id,
      sessionId: "sess1",
      assistantId: assistant.id,
    }

    const result = await resolveToolsForAssistant(assistant.id, "test/model", context)

    // Custom tool without URL should be skipped
    expect(result.toolNames).not.toContain("no_url_tool")
  })
})
