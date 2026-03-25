import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  createCustomToolForEmployee,
  deleteCustomToolForEmployee,
  getCustomToolForEmployee,
  listCustomToolsForEmployee,
  updateCustomToolForEmployee,
} from "./service"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  createCustomTool: vi.fn(),
  deleteCustomToolById: vi.fn(),
  findCustomToolByEmployeeAndToolId: vi.fn(),
  findEmployeeForCustomTools: vi.fn(),
  listCustomToolsByEmployeeId: vi.fn(),
  updateCustomToolById: vi.fn(),
}))

describe("digital employee custom-tools service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("auto-approves autonomous employee tools", async () => {
    vi.mocked(repository.findEmployeeForCustomTools).mockResolvedValue({
      id: "employee_1",
      autonomyLevel: "autonomous",
    } as never)
    vi.mocked(repository.createCustomTool).mockResolvedValue({
      id: "tool_1",
    } as never)

    const result = await createCustomToolForEmployee({
      employeeId: "employee_1",
      createdBy: "user_1",
      input: {
        name: "Helper",
        code: "export default 1",
      },
      context: { organizationId: "org_1" },
    })

    expect(result).toEqual({ id: "tool_1" })
    expect(repository.createCustomTool).toHaveBeenCalledWith(
      expect.objectContaining({
        digitalEmployeeId: "employee_1",
        approved: true,
        language: "javascript",
        parameters: {},
      })
    )
  })

  it("returns 404 when a tool is missing", async () => {
    vi.mocked(repository.findEmployeeForCustomTools).mockResolvedValue({
      id: "employee_1",
      autonomyLevel: "supervised",
    } as never)
    vi.mocked(repository.findCustomToolByEmployeeAndToolId).mockResolvedValue(null)

    const result = await getCustomToolForEmployee({
      employeeId: "employee_1",
      toolId: "missing",
      context: { organizationId: null },
    })

    expect(result).toEqual({ status: 404, error: "Tool not found" })
  })

  it("updates a tool using only provided fields", async () => {
    vi.mocked(repository.findEmployeeForCustomTools).mockResolvedValue({
      id: "employee_1",
      autonomyLevel: "supervised",
    } as never)
    vi.mocked(repository.updateCustomToolById).mockResolvedValue({
      id: "tool_1",
      enabled: false,
    } as never)

    const result = await updateCustomToolForEmployee({
      employeeId: "employee_1",
      toolId: "tool_1",
      input: { enabled: false },
      context: { organizationId: null },
    })

    expect(result).toEqual({ id: "tool_1", enabled: false })
    expect(repository.updateCustomToolById).toHaveBeenCalledWith(
      "tool_1",
      expect.objectContaining({ enabled: false })
    )
  })

  it("deletes a tool after access is confirmed", async () => {
    vi.mocked(repository.findEmployeeForCustomTools).mockResolvedValue({
      id: "employee_1",
      autonomyLevel: "supervised",
    } as never)
    vi.mocked(repository.deleteCustomToolById).mockResolvedValue({
      id: "tool_1",
    } as never)

    const result = await deleteCustomToolForEmployee({
      employeeId: "employee_1",
      toolId: "tool_1",
      context: { organizationId: "org_1" },
    })

    expect(result).toEqual({ success: true })
    expect(repository.deleteCustomToolById).toHaveBeenCalledWith("tool_1")
  })

  it("lists tools for an accessible employee", async () => {
    vi.mocked(repository.findEmployeeForCustomTools).mockResolvedValue({
      id: "employee_1",
      autonomyLevel: "supervised",
    } as never)
    vi.mocked(repository.listCustomToolsByEmployeeId).mockResolvedValue([
      { id: "tool_1" },
    ] as never)

    const result = await listCustomToolsForEmployee({
      employeeId: "employee_1",
      context: { organizationId: "org_1" },
    })

    expect(result).toEqual([{ id: "tool_1" }])
  })
})
