import { beforeEach, describe, expect, it, vi } from "vitest"
import { executeRuntimeTool } from "./service"
import * as repository from "./repository"
import * as builtinTools from "@/lib/tools/builtin"
import * as gateway from "@/lib/skills/gateway"

vi.mock("./repository", () => ({
  findRuntimeEmployeeToolContext: vi.fn(),
}))

vi.mock("@/lib/tools/builtin", () => ({
  getBuiltinTool: vi.fn(),
}))

vi.mock("@/lib/skills/gateway", () => ({
  executeCommunityTool: vi.fn(),
  getCommunityTool: vi.fn(),
}))

describe("runtime-tools-execute service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("executes enabled builtin tools", async () => {
    vi.mocked(repository.findRuntimeEmployeeToolContext).mockResolvedValue({
      organizationId: "org_1",
      assistantId: "assistant_1",
      assistant: {
        tools: [
          {
            tool: { name: "calculator" },
          },
        ],
      },
    } as never)
    vi.mocked(builtinTools.getBuiltinTool).mockReturnValue({
      execute: vi.fn(async (input) => ({ ok: input })),
    } as never)

    const result = await executeRuntimeTool("employee_1", {
      toolName: "calculator",
      input: { value: 2 },
    })

    expect(result).toEqual({ result: { ok: { value: 2 } } })
  })

  it("blocks tools that are not enabled for the employee", async () => {
    vi.mocked(repository.findRuntimeEmployeeToolContext).mockResolvedValue({
      organizationId: "org_1",
      assistantId: "assistant_1",
      assistant: {
        tools: [
          {
            tool: { name: "text_utilities" },
          },
        ],
      },
    } as never)

    const result = await executeRuntimeTool("employee_1", {
      toolName: "calculator",
    })

    expect(result).toEqual({
      status: 403,
      error: 'Tool "calculator" is not enabled for this employee',
    })
  })

  it("falls back to community tools when no builtin exists", async () => {
    vi.mocked(repository.findRuntimeEmployeeToolContext).mockResolvedValue({
      organizationId: "org_1",
      assistantId: "assistant_1",
      assistant: {
        tools: [
          {
            tool: { name: "community_tool" },
          },
        ],
      },
    } as never)
    vi.mocked(builtinTools.getBuiltinTool).mockReturnValue(undefined)
    vi.mocked(gateway.getCommunityTool).mockResolvedValue({
      execute: vi.fn(async (input) => ({ community: input })),
    } as never)
    vi.mocked(gateway.executeCommunityTool).mockResolvedValue({
      community: { foo: "bar" },
    } as never)

    const result = await executeRuntimeTool("employee_1", {
      toolName: "community_tool",
      input: { foo: "bar" },
    })

    expect(gateway.executeCommunityTool).toHaveBeenCalledWith(
      "community_tool",
      { foo: "bar" },
      { organizationId: "org_1" }
    )
    expect(result).toEqual({ result: { community: { foo: "bar" } } })
  })
})
