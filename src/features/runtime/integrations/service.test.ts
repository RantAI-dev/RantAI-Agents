import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  requestRuntimeIntegrationCredentials,
  storeRuntimeIntegrationCredentials,
  testRuntimeIntegration,
} from "./service"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  createRuntimeIntegrationApproval: vi.fn(),
  findRuntimeEmployeeIntegration: vi.fn(),
  updateRuntimeEmployeeIntegration: vi.fn(),
  upsertRuntimeEmployeeIntegration: vi.fn(),
}))

vi.mock("@/lib/digital-employee/integrations", () => ({
  getIntegrationDefinition: vi.fn(),
}))

vi.mock("@/lib/workflow/credentials", () => ({
  decryptCredential: vi.fn(),
  encryptCredential: vi.fn((input) => `encrypted:${JSON.stringify(input)}`),
}))

describe("runtime-integrations service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("creates a credential approval request", async () => {
    vi.mocked(repository.createRuntimeIntegrationApproval).mockResolvedValue({
      id: "approval_1",
    } as never)

    const result = await requestRuntimeIntegrationCredentials({
      employeeId: "employee_1",
      input: { integrationId: "slack" },
    })

    expect(result).toEqual({ approvalId: "approval_1", status: "pending" })
  })

  it("stores integration credentials and returns integration metadata", async () => {
    vi.mocked(repository.upsertRuntimeEmployeeIntegration).mockResolvedValue({
      integrationId: "slack",
      status: "connected",
      connectedAt: new Date("2026-01-01T00:00:00.000Z"),
    } as never)

    const result = await storeRuntimeIntegrationCredentials({
      employeeId: "employee_1",
      integrationId: "slack",
      credentials: { botToken: "secret" },
      expiresIn: 3600,
      metadata: { scope: "runtime" },
    })

    expect(result).toMatchObject({
      success: true,
      integrationId: "slack",
      status: "connected",
    })
  })

  it("returns a 400 when the integration is missing credentials", async () => {
    vi.mocked(repository.findRuntimeEmployeeIntegration).mockResolvedValue({
      id: "conn_1",
      encryptedData: null,
    } as never)

    const result = await testRuntimeIntegration("employee_1", {
      integrationId: "slack",
    })

    expect(result).toEqual({ success: false, error: "No credentials stored" })
  })
})
