import {
  countDocumentsByCategoryName,
  countKnowledgeCategories,
  createKnowledgeCategory,
  deleteKnowledgeCategory,
  findKnowledgeCategoryById,
  findKnowledgeCategoryByName,
  listKnowledgeCategories,
  seedKnowledgeCategories,
  updateKnowledgeCategory,
} from "./repository"
import { recordKnowledgeAudit } from "@/lib/audit/knowledge"
import type { KnowledgeCategoryCreateInput, KnowledgeCategoryUpdateInput } from "./schema"

export interface ServiceError {
  status: number
  error: string
}

export interface KnowledgeCategoryResponse {
  id: string
  name: string
  label: string
  color: string
  isSystem: boolean
}

function mapCategory(category: {
  id: string
  name: string
  label: string
  color: string
  isSystem: boolean
}) {
  return {
    id: category.id,
    name: category.name,
    label: category.label,
    color: category.color,
    isSystem: category.isSystem,
  }
}

function toName(label: string) {
  return label.toUpperCase().replace(/\s+/g, "_").replace(/[^A-Z0-9_]/g, "")
}

/**
 * Lists categories visible to the caller's org (own + global) and seeds the
 * global defaults the first time anyone calls into the system.
 */
export async function listKnowledgeCategoriesForDashboard(organizationId: string | null = null) {
  // Seed is based on the global pool only — never re-seed per-org. If the
  // global pool is empty, seed it once and then read.
  const globalCount = await countKnowledgeCategories(null)
  if (globalCount === 0) {
    await seedKnowledgeCategories()
  }

  const categories = await listKnowledgeCategories(organizationId)
  return categories.map((category) => ({
    ...mapCategory(category),
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  }))
}

/**
 * Creates a category for the dashboard knowledge UI, scoped to the caller's org.
 */
export async function createKnowledgeCategoryForDashboard(params: {
  input: KnowledgeCategoryCreateInput
  organizationId: string | null
  userId?: string | null
}): Promise<KnowledgeCategoryResponse | ServiceError> {
  if (!params.input.label) {
    return { status: 400, error: "Label is required" }
  }

  if (!params.input.color) {
    return { status: 400, error: "Color is required" }
  }

  const name = toName(params.input.label)
  // Disallow shadowing a global category name with a per-org one, otherwise
  // listing shows two rows with the same name and Document.categories ambiguity.
  const existing =
    (await findKnowledgeCategoryByName(name, params.organizationId)) ||
    (await findKnowledgeCategoryByName(name, null))
  if (existing) {
    return { status: 400, error: "A category with this name already exists" }
  }

  const category = await createKnowledgeCategory({
    name,
    label: params.input.label,
    color: params.input.color,
    isSystem: false,
    organizationId: params.organizationId,
  })

  recordKnowledgeAudit({
    organizationId: params.organizationId,
    userId: params.userId ?? null,
    action: "category.create",
    entityType: "category",
    entityId: category.id,
    detail: { name: category.name, label: category.label, color: category.color },
  })

  return mapCategory(category)
}

/**
 * Updates a dashboard knowledge category, scoped to the caller's org.
 */
export async function updateKnowledgeCategoryForDashboard(params: {
  id: string
  input: KnowledgeCategoryUpdateInput
  organizationId: string | null
  userId?: string | null
}): Promise<KnowledgeCategoryResponse | ServiceError> {
  const category = await findKnowledgeCategoryById(params.id)
  if (!category) {
    return { status: 404, error: "Category not found" }
  }

  // Cross-tenant guard: org members can't edit another org's categories.
  // Global (system) categories are read-only-name; color updates allowed below.
  if (category.organizationId && category.organizationId !== params.organizationId) {
    return { status: 404, error: "Category not found" }
  }
  if (!category.organizationId && !category.isSystem) {
    // legacy: pre-scoping rows with null org but isSystem=false.
    // Treat as global; allow color updates only.
  }

  let newName = category.name
  if (params.input.label && params.input.label !== category.label && !category.isSystem) {
    newName = toName(params.input.label)

    const existing = await findKnowledgeCategoryByName(newName, category.organizationId ?? null)
    if (existing && existing.id !== params.id) {
      return { status: 400, error: "A category with this name already exists" }
    }
  }

  const updated = await updateKnowledgeCategory(params.id, {
    ...(params.input.label && !category.isSystem && { name: newName, label: params.input.label }),
    ...(params.input.color && { color: params.input.color }),
  })

  recordKnowledgeAudit({
    organizationId: params.organizationId,
    userId: params.userId ?? null,
    action: "category.update",
    entityType: "category",
    entityId: params.id,
    detail: { label: params.input.label, color: params.input.color },
  })

  return mapCategory(updated)
}

/**
 * Deletes a non-system dashboard knowledge category. Cross-tenant guarded.
 */
export async function deleteKnowledgeCategoryForDashboard(
  id: string,
  organizationId: string | null,
  userId: string | null = null
): Promise<{ success: true } | ServiceError> {
  const category = await findKnowledgeCategoryById(id)
  if (!category) {
    return { status: 404, error: "Category not found" }
  }

  if (category.isSystem) {
    return { status: 400, error: "Cannot delete system categories" }
  }

  if (category.organizationId && category.organizationId !== organizationId) {
    return { status: 404, error: "Category not found" }
  }

  // Only count documents within the same scope (own org for per-org categories;
  // all docs for the rare null-org non-system category).
  const count = await countDocumentsByCategoryName(category.name, category.organizationId)
  if (count > 0) {
    return { status: 400, error: `Cannot delete category. ${count} document(s) assigned. Please unassign or reassign them first.` }
  }

  await deleteKnowledgeCategory(id)
  recordKnowledgeAudit({
    organizationId,
    userId,
    action: "category.delete",
    entityType: "category",
    entityId: id,
    detail: { name: category.name },
    riskLevel: "medium",
  })
  return { success: true }
}
