import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  getDigitalEmployeeLifecycleStatus,
  goLiveDigitalEmployee,
  pauseDigitalEmployee,
  resumeDigitalEmployee,
  terminateDigitalEmployee,
} from "./service"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  findDigitalEmployeeLifecycleContextById: vi.fn(),
  updateDigitalEmployeeLifecycleById: vi.fn(),
}))

describe("digital-employee-lifecycle service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 404 when the employee is outside org scope", async () => {
    vi.mocked(repository.findDigitalEmployeeLifecycleContextById).mockResolvedValue(null)

    const result = await getDigitalEmployeeLifecycleStatus({
      digitalEmployeeId: "emp_1",
      organizationId: "org_1",
      deps: {
        getGroupContainerUrl: vi.fn(),
      },
    })

    expect(result).toEqual({ status: 404, error: "Not found" })
  })

  it("promotes a supervised employee to L2 on go-live", async () => {
    vi.mocked(repository.findDigitalEmployeeLifecycleContextById).mockResolvedValue({
      id: "emp_1",
      status: "DRAFT",
      groupId: "group_1",
      autonomyLevel: "L1",
      sandboxMode: true,
      trustScore: 20,
      organizationId: "org_1",
    })
    vi.mocked(repository.updateDigitalEmployeeLifecycleById).mockResolvedValue({
      sandboxMode: false,
      autonomyLevel: "L2",
    } as never)

    const result = await goLiveDigitalEmployee({
      digitalEmployeeId: "emp_1",
      organizationId: "org_1",
    })

    expect(result).toEqual({
      success: true,
      sandboxMode: false,
      autonomyLevel: "L2",
    })
  })

  it("starts the group when resuming", async () => {
    vi.mocked(repository.findDigitalEmployeeLifecycleContextById).mockResolvedValue({
      id: "emp_1",
      status: "SUSPENDED",
      groupId: "group_1",
      autonomyLevel: "L2",
      sandboxMode: false,
      trustScore: 50,
      organizationId: "org_1",
    })

    const orchestrator = {
      startGroup: vi.fn().mockResolvedValue({ containerId: "container_1", port: 1234 }),
      stopGroup: vi.fn(),
      deleteGroup: vi.fn(),
      getGroupContainerUrl: vi.fn(),
    }

    const result = await resumeDigitalEmployee({
      digitalEmployeeId: "emp_1",
      organizationId: "org_1",
      deps: {
        orchestrator: orchestrator as never,
      },
    })

    expect(result).toEqual({
      success: true,
      containerId: "container_1",
      port: 1234,
    })
  })

  it("stops the group when pausing and then marks suspended on terminate", async () => {
    vi.mocked(repository.findDigitalEmployeeLifecycleContextById).mockResolvedValue({
      id: "emp_1",
      status: "ACTIVE",
      groupId: "group_1",
      autonomyLevel: "L2",
      sandboxMode: false,
      trustScore: 50,
      organizationId: "org_1",
    })

    const orchestrator = {
      startGroup: vi.fn(),
      stopGroup: vi.fn().mockResolvedValue(undefined),
      deleteGroup: vi.fn(),
      getGroupContainerUrl: vi.fn(),
    }

    const pauseResult = await pauseDigitalEmployee({
      digitalEmployeeId: "emp_1",
      organizationId: "org_1",
      deps: {
        orchestrator: orchestrator as never,
      },
    })

    const terminateResult = await terminateDigitalEmployee({
      digitalEmployeeId: "emp_1",
      organizationId: "org_1",
      deps: {
        orchestrator: orchestrator as never,
      },
    })

    expect(pauseResult).toEqual({ success: true })
    expect(terminateResult).toEqual({ success: true })
    expect(repository.updateDigitalEmployeeLifecycleById).toHaveBeenCalledWith("emp_1", {
      status: "SUSPENDED",
    })
  })
})
