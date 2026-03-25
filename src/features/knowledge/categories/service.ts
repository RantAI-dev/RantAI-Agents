import {
  countKnowledgeCategories,
  createKnowledgeCategory,
  deleteKnowledgeCategory,
  findKnowledgeCategoryById,
  findKnowledgeCategoryByName,
  listKnowledgeCategories,
  seedKnowledgeCategories,
  updateKnowledgeCategory,
} from "./repository"
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
 * Lists categories and seeds defaults when empty.
 */
export async function listKnowledgeCategoriesForDashboard() {
  const count = await countKnowledgeCategories()
  if (count === 0) {
    await seedKnowledgeCategories()
  }

  const categories = await listKnowledgeCategories()
  return categories.map((category) => ({
    ...mapCategory(category),
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  }))
}

/**
 * Creates a category for the dashboard knowledge UI.
 */
export async function createKnowledgeCategoryForDashboard(params: {
  input: KnowledgeCategoryCreateInput
}): Promise<KnowledgeCategoryResponse | ServiceError> {
  if (!params.input.label) {
    return { status: 400, error: "Label is required" }
  }

  if (!params.input.color) {
    return { status: 400, error: "Color is required" }
  }

  const name = toName(params.input.label)
  const existing = await findKnowledgeCategoryByName(name)
  if (existing) {
    return { status: 400, error: "A category with this name already exists" }
  }

  const category = await createKnowledgeCategory({
    name,
    label: params.input.label,
    color: params.input.color,
    isSystem: false,
  })

  return mapCategory(category)
}

/**
 * Updates a dashboard knowledge category.
 */
export async function updateKnowledgeCategoryForDashboard(params: {
  id: string
  input: KnowledgeCategoryUpdateInput
}): Promise<KnowledgeCategoryResponse | ServiceError> {
  const category = await findKnowledgeCategoryById(params.id)
  if (!category) {
    return { status: 404, error: "Category not found" }
  }

  let newName = category.name
  if (params.input.label && params.input.label !== category.label && !category.isSystem) {
    newName = toName(params.input.label)

    const existing = await findKnowledgeCategoryByName(newName)
    if (existing && existing.id !== params.id) {
      return { status: 400, error: "A category with this name already exists" }
    }
  }

  const updated = await updateKnowledgeCategory(params.id, {
    ...(params.input.label && !category.isSystem && { name: newName, label: params.input.label }),
    ...(params.input.color && { color: params.input.color }),
  })

  return mapCategory(updated)
}

/**
 * Deletes a non-system dashboard knowledge category.
 */
export async function deleteKnowledgeCategoryForDashboard(id: string): Promise<{ success: true } | ServiceError> {
  const category = await findKnowledgeCategoryById(id)
  if (!category) {
    return { status: 404, error: "Category not found" }
  }

  if (category.isSystem) {
    return { status: 400, error: "Cannot delete system categories" }
  }

  await deleteKnowledgeCategory(id)
  return { success: true }
}
