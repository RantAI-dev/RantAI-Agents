import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  deleteOrganizationDetail,
  getOrganizationDetail,
  updateOrganizationDetail,
} from "./service"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  deleteOrganizationById: vi.fn(),
  findMembership: vi.fn(),
  findOrganizationDetailById: vi.fn(),
  updateOrganizationById: vi.fn(),
}))

describe("organization-detail service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 403 when actor is not an accepted member", async () => {
    vi.mocked(repository.findMembership).mockResolvedValue(null)

    const result = await getOrganizationDetail({
      actorUserId: "user_1",
      organizationId: "org_1",
    })

    expect(result).toEqual({ status: 403, error: "Not a member" })
  })

  it("blocks updates for non-admin/non-owner members", async () => {
    vi.mocked(repository.findMembership).mockResolvedValue({
      id: "m1",
      userId: "user_1",
      userEmail: "u1@example.com",
      userName: "User 1",
      organizationId: "org_1",
      role: "member",
      invitedBy: "owner_1",
      invitedAt: new Date(),
      acceptedAt: new Date(),
    })

    const result = await updateOrganizationDetail({
      actorUserId: "user_1",
      organizationId: "org_1",
      input: { name: "New Org Name" },
    })

    expect(result).toEqual({ status: 403, error: "Insufficient permissions" })
  })

  it("blocks deletion unless actor is owner", async () => {
    vi.mocked(repository.findMembership).mockResolvedValue({
      id: "m1",
      userId: "user_1",
      userEmail: "u1@example.com",
      userName: "User 1",
      organizationId: "org_1",
      role: "admin",
      invitedBy: "owner_1",
      invitedAt: new Date(),
      acceptedAt: new Date(),
    })

    const result = await deleteOrganizationDetail({
      actorUserId: "user_1",
      organizationId: "org_1",
    })

    expect(result).toEqual({
      status: 403,
      error: "Only the owner can delete an organization",
    })
  })
})
