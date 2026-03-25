import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  deleteWorkspaceFile,
  executeWorkspaceCommand,
  listWorkspaceFiles,
  readWorkspaceFile,
  writeWorkspaceFile,
} from "./service"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  findWorkspaceEmployee: vi.fn(),
  findWorkspaceGroupById: vi.fn(),
}))

describe("digital employee workspace service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("executes a workspace command through the gateway", async () => {
    vi.mocked(repository.findWorkspaceEmployee).mockResolvedValue({
      id: "employee_1",
      groupId: "group_1",
    } as never)
    vi.mocked(repository.findWorkspaceGroupById).mockResolvedValue({
      containerPort: 4242,
      gatewayToken: "token-1",
      containerId: "container_1",
      status: "RUNNING",
    } as never)
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        json: async () => ({ ok: true }),
      } as never)
    )

    const result = await executeWorkspaceCommand({
      employeeId: "employee_1",
      context: { organizationId: "org_1" },
      input: { command: "ls", cwd: "/workspace" },
    })

    expect(result).toEqual({ status: 200, data: { ok: true } })
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:4242/workspace/exec",
      expect.objectContaining({ method: "POST" })
    )
  })

  it("returns 503 when the team container is not running", async () => {
    vi.mocked(repository.findWorkspaceEmployee).mockResolvedValue({
      id: "employee_1",
      groupId: "group_1",
    } as never)
    vi.mocked(repository.findWorkspaceGroupById).mockResolvedValue({
      containerPort: null,
      gatewayToken: null,
      containerId: null,
      status: "IDLE",
    } as never)

    const result = await listWorkspaceFiles({
      employeeId: "employee_1",
      context: { organizationId: null },
    })

    expect(result).toEqual({ status: 503, error: "Team container not running" })
  })

  it("returns 400 when deleting without a path", async () => {
    const result = await deleteWorkspaceFile({
      employeeId: "employee_1",
      context: { organizationId: null },
      path: null,
    })

    expect(result).toEqual({ status: 400, error: "path is required" })
  })

  it("returns 400 when writing without content", async () => {
    const result = await writeWorkspaceFile({
      employeeId: "employee_1",
      context: { organizationId: null },
      input: { path: "notes.md", content: 123 as never },
    })

    expect(result).toEqual({ status: 400, error: "path and content are required" })
  })

  it("reads a workspace file through the gateway", async () => {
    vi.mocked(repository.findWorkspaceEmployee).mockResolvedValue({
      id: "employee_1",
      groupId: "group_1",
    } as never)
    vi.mocked(repository.findWorkspaceGroupById).mockResolvedValue({
      containerPort: 4242,
      gatewayToken: null,
      containerId: "container_1",
      status: "RUNNING",
    } as never)
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        json: async () => ({ content: "hello" }),
      } as never)
    )

    const result = await readWorkspaceFile({
      employeeId: "employee_1",
      context: { organizationId: null },
      path: "README.md",
    })

    expect(result).toEqual({ status: 200, data: { content: "hello" } })
  })
})
