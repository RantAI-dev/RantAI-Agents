import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  createKnowledgeCategoryForDashboard,
  deleteKnowledgeCategoryForDashboard,
  listKnowledgeCategoriesForDashboard,
  updateKnowledgeCategoryForDashboard,
} from "./service"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  countKnowledgeCategories: vi.fn(),
  createKnowledgeCategory: vi.fn(),
  deleteKnowledgeCategory: vi.fn(),
  findKnowledgeCategoryById: vi.fn(),
  findKnowledgeCategoryByName: vi.fn(),
  listKnowledgeCategories: vi.fn(),
  seedKnowledgeCategories: vi.fn(),
  updateKnowledgeCategory: vi.fn(),
}))

describe("dashboard knowledge categories service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("seeds default categories when empty", async () => {
    vi.mocked(repository.countKnowledgeCategories).mockResolvedValue(0)
    vi.mocked(repository.listKnowledgeCategories).mockResolvedValue([
      {
        id: "cat_1",
        name: "FAQ",
        label: "FAQ",
        color: "#8b5cf6",
        isSystem: true,
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        updatedAt: new Date("2024-01-02T00:00:00.000Z"),
      },
    ] as never)

    const result = await listKnowledgeCategoriesForDashboard()

    expect(repository.seedKnowledgeCategories).toHaveBeenCalled()
    expect(result).toEqual([
      {
        id: "cat_1",
        name: "FAQ",
        label: "FAQ",
        color: "#8b5cf6",
        isSystem: true,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-02T00:00:00.000Z",
      },
    ])
  })

  it("returns 400 when creating a category without a label", async () => {
    const result = await createKnowledgeCategoryForDashboard({ input: { color: "#fff" } as never })
    expect(result).toEqual({ status: 400, error: "Label is required" })
  })

  it("creates a category with a generated name", async () => {
    vi.mocked(repository.findKnowledgeCategoryByName).mockResolvedValue(null)
    vi.mocked(repository.createKnowledgeCategory).mockResolvedValue({
      id: "cat_1",
      name: "CUSTOM_LABEL",
      label: "Custom Label",
      color: "#fff",
      isSystem: false,
    } as never)

    const result = await createKnowledgeCategoryForDashboard({
      input: { label: "Custom Label", color: "#fff" } as never,
    })

    expect(result).toEqual({
      id: "cat_1",
      name: "CUSTOM_LABEL",
      label: "Custom Label",
      color: "#fff",
      isSystem: false,
    })
  })

  it("updates a category label when allowed", async () => {
    vi.mocked(repository.findKnowledgeCategoryById).mockResolvedValue({
      id: "cat_1",
      name: "CUSTOM_LABEL",
      label: "Custom Label",
      color: "#fff",
      isSystem: false,
    } as never)
    vi.mocked(repository.findKnowledgeCategoryByName).mockResolvedValue(null)
    vi.mocked(repository.updateKnowledgeCategory).mockResolvedValue({
      id: "cat_1",
      name: "NEW_LABEL",
      label: "New Label",
      color: "#000",
      isSystem: false,
    } as never)

    const result = await updateKnowledgeCategoryForDashboard({
      id: "cat_1",
      input: { label: "New Label", color: "#000" } as never,
    })

    expect(result).toEqual({
      id: "cat_1",
      name: "NEW_LABEL",
      label: "New Label",
      color: "#000",
      isSystem: false,
    })
  })

  it("prevents deleting system categories", async () => {
    vi.mocked(repository.findKnowledgeCategoryById).mockResolvedValue({
      id: "cat_1",
      name: "FAQ",
      label: "FAQ",
      color: "#8b5cf6",
      isSystem: true,
    } as never)

    const result = await deleteKnowledgeCategoryForDashboard("cat_1")

    expect(result).toEqual({ status: 400, error: "Cannot delete system categories" })
  })
})
