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
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      },
    ] as never)

    const result = await listOrganizationsForUser("user_1")

    expect(result).toEqual([
      expect.objectContaining({
        id: "org_1",
        role: "admin",
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
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
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
