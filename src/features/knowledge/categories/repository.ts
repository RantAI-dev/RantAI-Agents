import { prisma } from "@/lib/prisma"

export const DEFAULT_KNOWLEDGE_CATEGORIES = [
  { name: "LIFE_INSURANCE", label: "Life Insurance", color: "#3b82f6", isSystem: true },
  { name: "HEALTH_INSURANCE", label: "Health Insurance", color: "#22c55e", isSystem: true },
  { name: "HOME_INSURANCE", label: "Home Insurance", color: "#f97316", isSystem: true },
  { name: "FAQ", label: "FAQ", color: "#8b5cf6", isSystem: true },
  { name: "POLICY", label: "Policy", color: "#ef4444", isSystem: true },
  { name: "GENERAL", label: "General", color: "#6b7280", isSystem: true },
]

/** Scope helper: categories visible to a given org = its own + global (org=null). */
function visibilityWhere(organizationId: string | null) {
  if (!organizationId) return { organizationId: null }
  return {
    OR: [{ organizationId }, { organizationId: null }],
  }
}

export async function countKnowledgeCategories(organizationId: string | null = null) {
  return prisma.category.count({ where: visibilityWhere(organizationId) })
}

/** Seed only global / system categories. Idempotent: skips when any exist already. */
export async function seedKnowledgeCategories() {
  return prisma.category.createMany({
    data: DEFAULT_KNOWLEDGE_CATEGORIES.map((c) => ({ ...c, organizationId: null })),
    skipDuplicates: true,
  })
}

export async function listKnowledgeCategories(organizationId: string | null = null) {
  return prisma.category.findMany({
    where: visibilityWhere(organizationId),
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  })
}

export async function findKnowledgeCategoryById(id: string) {
  return prisma.category.findUnique({
    where: { id },
  })
}

export async function findKnowledgeCategoryByName(
  name: string,
  organizationId: string | null = null
) {
  // findUnique with nullable compound key would mishandle the org=null case
  // (Postgres NULL!=NULL), so use findFirst to honor "global" rows properly.
  return prisma.category.findFirst({
    where: { name, organizationId },
  })
}

export async function createKnowledgeCategory(data: {
  name: string
  label: string
  color: string
  isSystem: boolean
  organizationId: string | null
}) {
  return prisma.category.create({
    data,
  })
}

export async function updateKnowledgeCategory(
  id: string,
  data: {
    name?: string
    label?: string
    color?: string
  }
) {
  return prisma.category.update({
    where: { id },
    data,
  })
}

export async function deleteKnowledgeCategory(id: string) {
  return prisma.category.delete({
    where: { id },
  })
}

export async function countDocumentsByCategoryName(
  categoryName: string,
  organizationId: string | null = null
) {
  return prisma.document.count({
    where: {
      categories: { has: categoryName },
      ...(organizationId !== null && { organizationId }),
    },
  })
}
