import { clearSemanticMemory } from "@/lib/memory/semantic-memory"
import { clearUserProfile } from "@/lib/memory/long-term-memory"
import {
  countMemoriesByType,
  deleteMemoriesByType,
  deleteMemoryById,
  findMemoriesByUser,
  findMemoryById,
} from "./repository"
import type { DashboardMemoryBulkDeleteInput } from "./schema"

export interface ServiceError {
  status: number
  error: string
}

export interface DashboardMemoryItem {
  id: string
  type: string
  key: string
  value: unknown
  confidence: number | null
  source: string | null
  createdAt: string
  updatedAt: string
  expiresAt: string | null
}

export interface DashboardMemoryStats {
  working: number
  semantic: number
  longTerm: number
  total: number
}

/**
 * Lists dashboard memory entries and summary stats for a user.
 */
export async function listDashboardMemories(params: {
  userId: string
  type?: string | null
}): Promise<{ memories: DashboardMemoryItem[]; stats: DashboardMemoryStats }> {
  const [memories, counts] = await Promise.all([
    findMemoriesByUser(params.userId, params.type ?? null),
    countMemoriesByType(params.userId),
  ])

  const stats: DashboardMemoryStats = {
    working: 0,
    semantic: 0,
    longTerm: 0,
    total: 0,
  }

  for (const count of counts) {
    if (count.type === "WORKING") stats.working = count._count
    else if (count.type === "SEMANTIC") stats.semantic = count._count
    else if (count.type === "LONG_TERM") stats.longTerm = count._count
    stats.total += count._count
  }

  return {
    memories: memories.map((memory: {
      id: string
      type: string
      key: string
      value: unknown
      confidence: number | null
      source: string | null
      createdAt: Date
      updatedAt: Date
      expiresAt: Date | null
    }) => ({
      id: memory.id,
      type: memory.type,
      key: memory.key,
      value: memory.value,
      confidence: memory.confidence,
      source: memory.source,
      createdAt: memory.createdAt.toISOString(),
      updatedAt: memory.updatedAt.toISOString(),
      expiresAt: memory.expiresAt?.toISOString() ?? null,
    })),
    stats,
  }
}

/**
 * Bulk clears memories for a user by memory type.
 */
export async function clearDashboardMemories(params: {
  userId: string
  input: DashboardMemoryBulkDeleteInput
}): Promise<{ success: true } | ServiceError> {
  const { type } = params.input as { type?: unknown }

  if (!type || !["WORKING", "SEMANTIC", "LONG_TERM"].includes(String(type))) {
    return { status: 400, error: "type must be WORKING, SEMANTIC, or LONG_TERM" }
  }

  if (type === "WORKING") {
    await deleteMemoriesByType(params.userId, "WORKING")
  } else if (type === "SEMANTIC") {
    await deleteMemoriesByType(params.userId, "SEMANTIC")
    try {
      await clearSemanticMemory(params.userId)
    } catch (error) {
      console.error("[Memory API] SurrealDB clear error (non-fatal):", error)
    }
  } else if (type === "LONG_TERM") {
    await clearUserProfile(params.userId)
  }

  return { success: true }
}

/**
 * Deletes a single memory entry after verifying ownership.
 */
export async function deleteDashboardMemory(params: {
  userId: string
  memoryId: string
}): Promise<{ success: true } | ServiceError> {
  const memory = await findMemoryById(params.memoryId)
  if (!memory) {
    return { status: 404, error: "Not found" }
  }

  if (memory.userId !== params.userId) {
    return { status: 403, error: "Forbidden" }
  }

  await deleteMemoryById(params.memoryId)
  return { success: true }
}
