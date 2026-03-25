import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  changeOrganizationMemberRole,
  inviteOrganizationMember,
  listOrganizationMembers,
  removeOrganizationMember,
} from "./service"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  createOrganizationMember: vi.fn(),
  deleteMember: vi.fn(),
  findMemberByEmailInOrganization: vi.fn(),
  findMemberById: vi.fn(),
  findMembership: vi.fn(),
  findMembersByOrganizationId: vi.fn(),
  findOrganizationWithMemberCount: vi.fn(),
  findUserByEmail: vi.fn(),
  updateMemberRole: vi.fn(),
}))

describe("organization-members service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 403 when actor is not an accepted member", async () => {
    vi.mocked(repository.findMembership).mockResolvedValue(null)

    const result = await listOrganizationMembers({
      actorUserId: "user_1",
      organizationId: "org_1",
    })

    expect(result).toEqual({ status: 403, error: "Not a member" })
  })

  it("blocks invites from non-admin/non-owner members", async () => {
    vi.mocked(repository.findMembership).mockResolvedValue({
      id: "m_actor",
      userId: "user_1",
      userEmail: "a@example.com",
      userName: "Actor",
      organizationId: "org_1",
      role: "member",
      invitedBy: "owner_1",
      invitedAt: new Date(),
      acceptedAt: new Date(),
    })

    const result = await inviteOrganizationMember({
      actorUserId: "user_1",
      organizationId: "org_1",
      input: { email: "new@example.com", role: "member" },
    })

    expect(result).toEqual({ status: 403, error: "Insufficient permissions" })
  })

  it("blocks role changes unless actor is owner", async () => {
    vi.mocked(repository.findMembership).mockResolvedValue({
      id: "m_actor",
      userId: "user_1",
      userEmail: "a@example.com",
      userName: "Actor",
      organizationId: "org_1",
      role: "admin",
      invitedBy: "owner_1",
      invitedAt: new Date(),
      acceptedAt: new Date(),
    })
    vi.mocked(repository.findMemberById).mockResolvedValue({
      id: "m_target",
      userId: "user_2",
      userEmail: "u2@example.com",
      userName: "User Two",
      organizationId: "org_1",
      role: "member",
      invitedBy: "owner_1",
      invitedAt: new Date(),
      acceptedAt: new Date(),
    })

    const result = await changeOrganizationMemberRole({
      actorUserId: "user_1",
      organizationId: "org_1",
      memberId: "m_target",
      input: { role: "viewer" },
    })

    expect(result).toEqual({
      status: 403,
      error: "Only the owner can change member roles",
    })
  })

  it("prevents owner self-removal", async () => {
    vi.mocked(repository.findMembership).mockResolvedValue({
      id: "m_owner",
      userId: "owner_1",
      userEmail: "owner@example.com",
      userName: "Owner",
      organizationId: "org_1",
      role: "owner",
      invitedBy: null,
      invitedAt: new Date(),
      acceptedAt: new Date(),
    })
    vi.mocked(repository.findMemberById).mockResolvedValue({
      id: "m_owner",
      userId: "owner_1",
      userEmail: "owner@example.com",
      userName: "Owner",
      organizationId: "org_1",
      role: "owner",
      invitedBy: null,
      invitedAt: new Date(),
      acceptedAt: new Date(),
    })

    const result = await removeOrganizationMember({
      actorUserId: "owner_1",
      organizationId: "org_1",
      memberId: "m_owner",
    })

    expect(result).toEqual({
      status: 403,
      error: "Owner cannot leave. Transfer ownership first or delete the organization.",
    })
  })
})
