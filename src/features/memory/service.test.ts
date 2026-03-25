import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  clearDashboardMemories,
  deleteDashboardMemory,
  listDashboardMemories,
} from "./service"
import * as repository from "./repository"
import { clearSemanticMemory } from "@/lib/memory/semantic-memory"
import { clearUserProfile } from "@/lib/memory/long-term-memory"

vi.mock("./repository", () => ({
  countMemoriesByType: vi.fn(),
  deleteMemoriesByType: vi.fn(),
  deleteMemoryById: vi.fn(),
  findMemoriesByUser: vi.fn(),
  findMemoryById: vi.fn(),
}))

vi.mock("@/lib/memory/semantic-memory", () => ({
  clearSemanticMemory: vi.fn(),
}))

vi.mock("@/lib/memory/long-term-memory", () => ({
  clearUserProfile: vi.fn(),
}))

describe("dashboard memory service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("lists memories and stats", async () => {
    vi.mocked(repository.findMemoriesByUser).mockResolvedValue([
      {
        id: "memory_1",
        type: "WORKING",
        key: "theme",
        value: "dark",
        confidence: 0.9,
        source: "chat",
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
        updatedAt: new Date("2025-01-02T00:00:00.000Z"),
        expiresAt: null,
      },
    ] as never)
    vi.mocked(repository.countMemoriesByType).mockResolvedValue([
      { type: "WORKING", _count: 1 },
      { type: "SEMANTIC", _count: 2 },
    ] as never)

    const result = await listDashboardMemories({ userId: "user_1" })

    expect(result.stats).toEqual({
      working: 1,
      semantic: 2,
      longTerm: 0,
      total: 3,
    })
  })

  it("clears semantic memory and local rows", async () => {
    const result = await clearDashboardMemories({
      userId: "user_1",
      input: { type: "SEMANTIC" },
    })

    expect(result).toEqual({ success: true })
    expect(clearSemanticMemory).toHaveBeenCalledWith("user_1")
  })

  it("returns forbidden when deleting a memory owned by another user", async () => {
    vi.mocked(repository.findMemoryById).mockResolvedValue({ userId: "user_2" } as never)

    const result = await deleteDashboardMemory({
      userId: "user_1",
      memoryId: "memory_1",
    })

    expect(result).toEqual({ status: 403, error: "Forbidden" })
  })

  it("returns 400 for unsupported memory type", async () => {
    const result = await clearDashboardMemories({
      userId: "user_1",
      input: { type: "BAD" } as never,
    })

    expect(result).toEqual({
      status: 400,
      error: "type must be WORKING, SEMANTIC, or LONG_TERM",
    })
  })
})
