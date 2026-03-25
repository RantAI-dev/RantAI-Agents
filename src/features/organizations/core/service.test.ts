import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  createOrganizationForUser,
  listOrganizationsForUser,
} from "./service"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  createOrganizationWithOwner: vi.fn(),
  findAcceptedMembershipsByUserId: vi.fn(),
  findOrganizationBySlug: vi.fn(),
}))

describe("organizations service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("maps memberships into organization list response", async () => {
    vi.mocked(repository.findAcceptedMembershipsByUserId).mockResolvedValue([
      {
        role: "admin",
        acceptedAt: new Date("2026-01-01T00:00:00.000Z"),
        organization: {
          id: "org_1",
          name: "Org 1",
          slug: "org-1",
          logoUrl: null,
          plan: "pro",
          maxMembers: 10,
          maxAssistants: 5,
          maxDocuments: 100,
          maxApiKeys: 10,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          _count: {
            memberships: 3,
            assistants: 2,
            documents: 7,
            embedKeys: 1,
          },
        },
      },
    ] as never)

    const result = await listOrganizationsForUser("user_1")

    expect(result).toEqual([
      expect.objectContaining({
        id: "org_1",
        role: "admin",
        counts: { members: 3, assistants: 2, documents: 7, apiKeys: 1 },
      }),
    ])
  })

  it("returns 400 when trimmed org name is too short", async () => {
    const result = await createOrganizationForUser({
      input: { name: " " },
      userId: "user_1",
      userEmail: "u1@example.com",
    })

    expect(result).toEqual({
      status: 400,
      error: "Organization name must be at least 2 characters",
    })
  })

  it("appends random suffix when slug already exists", async () => {
    vi.mocked(repository.findOrganizationBySlug).mockResolvedValue({
      id: "org_existing",
      slug: "my-org",
    })
    vi.mocked(repository.createOrganizationWithOwner).mockResolvedValue({
      id: "org_new",
      name: "My Org",
      slug: "my-org-azuo",
      logoUrl: null,
      plan: "free",
      maxMembers: 5,
      maxAssistants: 3,
      maxDocuments: 100,
      maxApiKeys: 2,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      _count: {
        memberships: 1,
        assistants: 0,
        documents: 0,
        embedKeys: 0,
      },
    } as never)

    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.30544167)

    await createOrganizationForUser({
      input: { name: "My Org", slug: "my-org" },
      userId: "user_1",
      userEmail: "u1@example.com",
      userName: "User 1",
    })

    expect(repository.createOrganizationWithOwner).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "my-org-azuo",
      })
    )

    randomSpy.mockRestore()
  })
})
