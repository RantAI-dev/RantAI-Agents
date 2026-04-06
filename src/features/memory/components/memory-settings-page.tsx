import { auth } from "@/lib/auth"
import {
  listDashboardMemories,
  type DashboardMemoryItem,
  type DashboardMemoryStats,
} from "@/features/memory/service"
import MemorySettingsClient from "./memory-settings-client"
import type { MemoryItem, MemoryStats } from "@/hooks/use-memory"

function normalizeMemoryType(value: string): MemoryItem["type"] {
  if (value === "WORKING" || value === "SEMANTIC" || value === "LONG_TERM") {
    return value
  }
  return "WORKING"
}

function mapMemory(item: DashboardMemoryItem): MemoryItem {
  return {
    ...item,
    type: normalizeMemoryType(item.type),
  }
}

function mapStats(stats: DashboardMemoryStats): MemoryStats {
  return {
    working: stats.working,
    semantic: stats.semantic,
    longTerm: stats.longTerm,
    total: stats.total,
  }
}

export default async function MemorySettingsPage() {
  const session = await auth()

  if (!session?.user?.id) {
    return (
      <MemorySettingsClient
        initialMemories={[]}
        initialStats={{ working: 0, semantic: 0, longTerm: 0, total: 0 }}
      />
    )
  }

  const result = await listDashboardMemories({
    userId: session.user.id,
    type: null,
  })

  return (
    <MemorySettingsClient
      initialMemories={result.memories.map(mapMemory)}
      initialStats={mapStats(result.stats)}
    />
  )
}
