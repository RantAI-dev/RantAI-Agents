import { prisma } from "@/lib/prisma"

export const DEFAULT_KNOWLEDGE_CATEGORIES = [
  { name: "LIFE_INSURANCE", label: "Life Insurance", color: "#3b82f6", isSystem: true },
  { name: "HEALTH_INSURANCE", label: "Health Insurance", color: "#22c55e", isSystem: true },
  { name: "HOME_INSURANCE", label: "Home Insurance", color: "#f97316", isSystem: true },
  { name: "FAQ", label: "FAQ", color: "#8b5cf6", isSystem: true },
  { name: "POLICY", label: "Policy", color: "#ef4444", isSystem: true },
  { name: "GENERAL", label: "General", color: "#6b7280", isSystem: true },
]

export async function countKnowledgeCategories() {
  return prisma.category.count()
}

export async function seedKnowledgeCategories() {
  return prisma.category.createMany({
    data: DEFAULT_KNOWLEDGE_CATEGORIES,
  })
}

export async function listKnowledgeCategories() {
  return prisma.category.findMany({
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  })
}

export async function findKnowledgeCategoryById(id: string) {
  return prisma.category.findUnique({
    where: { id },
  })
}

export async function findKnowledgeCategoryByName(name: string) {
  return prisma.category.findUnique({
    where: { name },
  })
}

export async function createKnowledgeCategory(data: {
  name: string
  label: string
  color: string
  isSystem: boolean
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
