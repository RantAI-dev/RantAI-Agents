import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  getDigitalEmployeeRun,
  listDigitalEmployeeRuns,
  triggerDigitalEmployeeRun,
} from "./service"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  findDigitalEmployeeGroupGatewayTokenById: vi.fn(),
  findDigitalEmployeeRunById: vi.fn(),
  findDigitalEmployeeRunContextById: vi.fn(),
  findDigitalEmployeeRunsById: vi.fn(),
}))

describe("digital-employee-runs service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 404 when the employee is outside org scope", async () => {
    vi.mocked(repository.findDigitalEmployeeRunContextById).mockResolvedValue(null)

    const result = await listDigitalEmployeeRuns({
      digitalEmployeeId: "emp_1",
      organizationId: "org_1",
      limit: 10,
    })

    expect(result).toEqual({ status: 404, error: "Not found" })
  })

  it("returns 404 when the run is missing", async () => {
    vi.mocked(repository.findDigitalEmployeeRunContextById).mockResolvedValue({
      id: "emp_1",
      status: "ACTIVE",
      groupId: "group_1",
    })
    vi.mocked(repository.findDigitalEmployeeRunById).mockResolvedValue(null)

    const result = await getDigitalEmployeeRun({
      digitalEmployeeId: "emp_1",
      organizationId: "org_1",
      runId: "run_1",
    })

    expect(result).toEqual({ status: 404, error: "Run not found" })
  })

  it("triggers a manual run through the container trigger endpoint", async () => {
    vi.mocked(repository.findDigitalEmployeeRunContextById).mockResolvedValue({
      id: "emp_1",
      status: "ACTIVE",
      groupId: "group_1",
    })
    vi.mocked(repository.findDigitalEmployeeGroupGatewayTokenById).mockResolvedValue({
      gatewayToken: "gateway-token",
    })

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ runId: "run_123" }),
    })

    const result = await triggerDigitalEmployeeRun({
      digitalEmployeeId: "emp_1",
      organizationId: "org_1",
      input: {},
      deps: {
        getGroupContainerUrl: vi.fn().mockResolvedValue("http://container"),
        fetch: fetchMock as typeof fetch,
      },
    })

    expect(result).toEqual({ runId: "run_123" })
    expect(fetchMock).toHaveBeenCalledWith(
      "http://container/trigger",
      expect.objectContaining({
        method: "POST",
      })
    )
  })
})
