import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  createDashboardCredential,
  deleteDashboardCredentialRecord,
  getDashboardCredential,
  listDashboardCredentials,
} from "./service"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  createDashboardCredential: vi.fn(),
  deleteDashboardCredential: vi.fn(),
  findDashboardCredentialById: vi.fn(),
  findDashboardCredentials: vi.fn(),
  updateDashboardCredential: vi.fn(),
}))

vi.mock("@/lib/workflow/credentials", () => ({
  encryptCredential: vi.fn(() => "encrypted"),
}))

describe("dashboard-credentials service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("lists visible credentials", async () => {
    vi.mocked(repository.findDashboardCredentials).mockResolvedValue([
      {
        id: "cred_1",
        name: "Primary",
        type: "api_key",
        organizationId: null,
        createdBy: "user_1",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      },
    ] as never)

    const result = await listDashboardCredentials({
      organizationId: null,
      userId: "user_1",
    })

    expect(result[0]?.createdAt).toBe("2026-01-01T00:00:00.000Z")
  })

  it("returns 404 when a credential is missing", async () => {
    vi.mocked(repository.findDashboardCredentialById).mockResolvedValue(null)

    await expect(
      getDashboardCredential({
        context: { organizationId: null, userId: "user_1" },
        id: "cred_1",
      })
    ).resolves.toEqual({ status: 404, error: "Credential not found" })
  })

  it("creates encrypted credentials", async () => {
    vi.mocked(repository.createDashboardCredential).mockResolvedValue({
      id: "cred_1",
      name: "Primary",
      type: "api_key",
      organizationId: null,
      createdBy: "user_1",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    } as never)

    const result = await createDashboardCredential({
      context: { organizationId: null, userId: "user_1" },
      input: { name: "Primary", type: "api_key", data: { token: "abc" } },
    })

    expect(result).toMatchObject({ id: "cred_1" })
  })

  it("allows deleting personal credentials", async () => {
    vi.mocked(repository.findDashboardCredentialById).mockResolvedValue({
      id: "cred_1",
      name: "Primary",
      type: "api_key",
      organizationId: null,
      createdBy: "user_1",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never)

    const result = await deleteDashboardCredentialRecord({
      context: { organizationId: null, userId: "user_1" },
      id: "cred_1",
    })

    expect(result).toEqual({ success: true })
  })
})
