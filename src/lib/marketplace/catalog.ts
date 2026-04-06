import { prisma } from "@/lib/prisma"
import type { MarketplaceCatalogItem } from "./types"
import type { CatalogItem } from "@prisma/client"

/**
 * Get catalog items from DB, optionally filtered.
 */
export async function getCatalogItems(filters?: {
  category?: string
  type?: "tool" | "skill" | "workflow" | "assistant" | "mcp"
  search?: string
}): Promise<MarketplaceCatalogItem[]> {
  const where: Record<string, unknown> = {}

  if (filters?.category) where.category = filters.category
  if (filters?.type) where.type = filters.type
  if (filters?.search) {
    const q = filters.search
    where.OR = [
      { displayName: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { tags: { has: q.toLowerCase() } },
    ]
  }

  const rows = await prisma.catalogItem.findMany({
    where,
    orderBy: [{ featured: "desc" }, { displayName: "asc" }],
  })

  return rows.map(mapRowToItem)
}

/**
 * Get a single catalog item by ID.
 */
export async function getCatalogItemById(
  id: string
): Promise<MarketplaceCatalogItem | null> {
  const row = await prisma.catalogItem.findUnique({ where: { id } })
  return row ? mapRowToItem(row) : null
}

/**
 * Get distinct categories from the catalog, optionally filtered by type.
 */
export async function getCatalogCategories(
  type?: "tool" | "skill" | "workflow" | "assistant" | "mcp"
): Promise<string[]> {
  const where: Record<string, unknown> = {}
  if (type) where.type = type
  const result = await prisma.catalogItem.findMany({
    where,
    select: { category: true },
    distinct: ["category"],
    orderBy: { category: "asc" },
  })
  return result.map((r) => r.category)
}

function mapRowToItem(row: CatalogItem): MarketplaceCatalogItem {
  return {
    id: row.id,
    name: row.name,
    displayName: row.displayName,
    description: row.description,
    category: row.category,
    type: row.type as MarketplaceCatalogItem["type"],
    icon: row.icon,
    tags: row.tags,
    featured: row.featured,
    sourceUrl: row.sourceUrl ?? undefined,
    toolTemplate: (row.toolTemplate as MarketplaceCatalogItem["toolTemplate"]) ?? undefined,
    skillTemplate: row.skillContent
      ? {
          name: row.name,
          displayName: row.displayName,
          description: row.description,
          content: row.skillContent,
          category: row.skillCategory || row.category,
          tags: row.tags,
        }
      : undefined,
    workflowTemplate: (row.workflowTemplate as object) ?? undefined,
    assistantTemplate: (row.assistantTemplate as MarketplaceCatalogItem["assistantTemplate"]) ?? undefined,
    mcpTemplate: (row.mcpTemplate as MarketplaceCatalogItem["mcpTemplate"]) ?? undefined,
    communitySkillName: row.communitySkillName ?? undefined,
    communityToolName: row.communityToolName ?? undefined,
    configSchema: (row.configSchema as object) ?? undefined,
  }
}

