import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  heartbeatRuntimeEmployee,
  listRuntimeEmployees,
  syncRuntimeEmployeeFiles,
} from "./service"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  createRuntimeEmployeeFile: vi.fn(),
  createRuntimeEmployeeMemory: vi.fn(),
  findRuntimeEmployeeDeploymentConfig: vi.fn(),
  findRuntimeEmployeeFile: vi.fn(),
  findRuntimeEmployeeMemory: vi.fn(),
  findRuntimeEmployeeOrganization: vi.fn(),
  listRuntimeEmployeesByOrganization: vi.fn(),
  markRuntimeEmployeeActive: vi.fn(),
  updateRuntimeEmployeeDeploymentConfig: vi.fn(),
  updateRuntimeEmployeeFile: vi.fn(),
  updateRuntimeEmployeeMemory: vi.fn(),
}))

describe("runtime-employees service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 404 when the caller employee is missing", async () => {
    vi.mocked(repository.findRuntimeEmployeeOrganization).mockResolvedValue(null)

    const result = await listRuntimeEmployees("employee_1")

    expect(result).toEqual({ status: 404, error: "Employee not found" })
  })

  it("syncs workspace and memory updates", async () => {
    vi.mocked(repository.findRuntimeEmployeeFile).mockResolvedValue({
      id: "file_1",
    } as never)
    vi.mocked(repository.findRuntimeEmployeeMemory).mockResolvedValue(null)
    vi.mocked(repository.findRuntimeEmployeeDeploymentConfig).mockResolvedValue({
      deploymentConfig: { schedules: [{ id: "manual_1" }] },
    } as never)

    const result = await syncRuntimeEmployeeFiles({
      employeeId: "employee_1",
      updatedBy: "container-sync",
      input: {
        changes: [
          { path: "notes.txt", content: "updated", type: "workspace" },
          { path: "2026-03-01.md", content: "memory", type: "memory" },
          { path: "cron.json", content: JSON.stringify([{ id: "cron_1" }]), type: "schedules" },
        ],
      },
    })

    expect(result).toEqual({ ok: true, synced: 3 })
    expect(repository.updateRuntimeEmployeeFile).toHaveBeenCalledWith("file_1", {
      content: "updated",
      updatedBy: "container-sync",
    })
    expect(repository.createRuntimeEmployeeMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "daily",
        date: "2026-03-01",
      })
    )
    expect(repository.updateRuntimeEmployeeDeploymentConfig).toHaveBeenCalledWith(
      "employee_1",
      expect.objectContaining({
        schedules: [{ id: "manual_1" }, { id: "cron_1" }],
      })
    )
  })

  it("returns 404 when heartbeat cannot find the employee", async () => {
    vi.mocked(repository.markRuntimeEmployeeActive).mockResolvedValue({
      count: 0,
    } as never)

    const result = await heartbeatRuntimeEmployee("employee_1")

    expect(result).toEqual({ status: 404, error: "Employee not found" })
  })
})
