import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  KnowledgeCategoryIdParamsSchema,
  KnowledgeCategoryUpdateSchema,
} from "@/src/features/knowledge/categories/schema"
import {
  deleteKnowledgeCategoryForDashboard,
  updateKnowledgeCategoryForDashboard,
} from "@/src/features/knowledge/categories/service"
import { isHttpServiceError } from "@/src/features/shared/http-service-error"

// PUT - Update category
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const parsedParams = KnowledgeCategoryIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid category id" }, { status: 400 })
    }

    const parsedBody = KnowledgeCategoryUpdateSchema.safeParse(await request.json())
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid request payload", details: parsedBody.error.flatten() }, { status: 400 })
    }

    const category = await updateKnowledgeCategoryForDashboard({
      id: parsedParams.data.id,
      input: parsedBody.data,
    })

    if (isHttpServiceError(category)) {
      return NextResponse.json({ error: category.error }, { status: category.status })
    }

    return NextResponse.json(category)
  } catch (error) {
    console.error("Failed to update category:", error)
    return NextResponse.json({ error: "Failed to update category" }, { status: 500 })
  }
}

// DELETE - Delete a category
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const parsedParams = KnowledgeCategoryIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid category id" }, { status: 400 })
    }

    const category = await deleteKnowledgeCategoryForDashboard(parsedParams.data.id)

    if (isHttpServiceError(category)) {
      return NextResponse.json({ error: category.error }, { status: category.status })
    }

    return NextResponse.json(category)
  } catch (error) {
    console.error("Failed to delete category:", error)
    return NextResponse.json({ error: "Failed to delete category" }, { status: 500 })
  }
}
