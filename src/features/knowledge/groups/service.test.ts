import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  createKnowledgeGroupForDashboard,
  deleteKnowledgeGroupForDashboard,
  getKnowledgeGroupForDashboard,
  listKnowledgeGroupsForDashboard,
  updateKnowledgeGroupForDashboard,
} from "./service"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  createKnowledgeGroup: vi.fn(),
  deleteKnowledgeGroup: vi.fn(),
  findKnowledgeGroupAccessById: vi.fn(),
  findKnowledgeGroupById: vi.fn(),
  listKnowledgeGroupsByOrganization: vi.fn(),
  updateKnowledgeGroup: vi.fn(),
}))

describe("dashboard knowledge groups service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("lists groups for a scope", async () => {
    vi.mocked(repository.listKnowledgeGroupsByOrganization).mockResolvedValue([
      {
        id: "group_1",
        name: "Guides",
        description: "Internal",
        color: "#fff",
        _count: { documents: 2 },
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        updatedAt: new Date("2024-01-02T00:00:00.000Z"),
      },
    ] as never)

    const result = await listKnowledgeGroupsForDashboard("org_1")

    expect(result).toEqual([
      {
        id: "group_1",
        name: "Guides",
        description: "Internal",
        color: "#fff",
        documentCount: 2,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-02T00:00:00.000Z",
      },
    ])
  })

  it("returns 400 when creating a group without a name", async () => {
    const result = await createKnowledgeGroupForDashboard({
      organizationId: null,
      role: null,
      userId: "user_1",
      input: {} as never,
    })

    expect(result).toEqual({ status: 400, error: "Name is required" })
  })

  it("loads a group with documents", async () => {
    vi.mocked(repository.findKnowledgeGroupById).mockResolvedValue({
      id: "group_1",
      name: "Guides",
      description: null,
      color: "#fff",
      organizationId: null,
      documents: [
        { document: { id: "doc_1", title: "Doc", categories: ["FAQ"] } },
      ],
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-02T00:00:00.000Z"),
    } as never)

    const result = await getKnowledgeGroupForDashboard({
      groupId: "group_1",
      organizationId: null,
    })

    expect(result).toMatchObject({
      id: "group_1",
      documents: [{ id: "doc_1", title: "Doc", categories: ["FAQ"] }],
    })
  })

  it("updates an allowed group", async () => {
    vi.mocked(repository.findKnowledgeGroupAccessById).mockResolvedValue({
      id: "group_1",
      organizationId: "org_1",
    } as never)
    vi.mocked(repository.updateKnowledgeGroup).mockResolvedValue({
      id: "group_1",
      name: "New",
      description: null,
      color: null,
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-02T00:00:00.000Z"),
    } as never)

    const result = await updateKnowledgeGroupForDashboard({
      groupId: "group_1",
      organizationId: "org_1",
      role: "admin",
      input: { name: "New" } as never,
    })

    expect(result).toMatchObject({ id: "group_1", name: "New" })
  })

  it("prevents deleting an org group without permission", async () => {
    vi.mocked(repository.findKnowledgeGroupAccessById).mockResolvedValue({
      id: "group_1",
      organizationId: "org_1",
    } as never)

    const result = await deleteKnowledgeGroupForDashboard({
      groupId: "group_1",
      organizationId: "org_1",
      role: "member",
    })

    expect(result).toEqual({ status: 403, error: "Insufficient permissions" })
  })
})
