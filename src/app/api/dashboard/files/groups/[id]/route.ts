import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  KnowledgeGroupIdParamsSchema,
  KnowledgeGroupUpdateSchema,
} from "@/features/knowledge/groups/schema"
import {
  deleteKnowledgeGroupForDashboard,
  getKnowledgeGroupForDashboard,
  updateKnowledgeGroupForDashboard,
} from "@/features/knowledge/groups/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"

// GET - Get a single group with documents
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const parsedParams = KnowledgeGroupIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid group id" }, { status: 400 })
    }

    const orgContext = await getOrganizationContext(request, session.user.id)
    const group = await getKnowledgeGroupForDashboard({
      groupId: parsedParams.data.id,
      organizationId: orgContext?.organizationId ?? null,
    })

    if (isHttpServiceError(group)) {
      return NextResponse.json({ error: group.error }, { status: group.status })
    }

    return NextResponse.json(group)
  } catch (error) {
    console.error("Failed to get group:", error)
    return NextResponse.json({ error: "Failed to get group" }, { status: 500 })
  }
}

// PUT - Update group
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const parsedParams = KnowledgeGroupIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid group id" }, { status: 400 })
    }

    const orgContext = await getOrganizationContext(request, session.user.id)
    const parsedBody = KnowledgeGroupUpdateSchema.safeParse(await request.json())
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid request payload", details: parsedBody.error.flatten() }, { status: 400 })
    }

    const group = await updateKnowledgeGroupForDashboard({
      groupId: parsedParams.data.id,
      organizationId: orgContext?.organizationId ?? null,
      role: orgContext?.membership.role ?? null,
      input: parsedBody.data,
    })

    if (isHttpServiceError(group)) {
      return NextResponse.json({ error: group.error }, { status: group.status })
    }

    return NextResponse.json(group)
  } catch (error) {
    console.error("Failed to update group:", error)
    return NextResponse.json({ error: "Failed to update group" }, { status: 500 })
  }
}

// DELETE - Delete a group (documents will have groupId set to null)
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const parsedParams = KnowledgeGroupIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid group id" }, { status: 400 })
    }

    const orgContext = await getOrganizationContext(request, session.user.id)
    const group = await deleteKnowledgeGroupForDashboard({
      groupId: parsedParams.data.id,
      organizationId: orgContext?.organizationId ?? null,
      role: orgContext?.membership.role ?? null,
    })

    if (isHttpServiceError(group)) {
      return NextResponse.json({ error: group.error }, { status: group.status })
    }

    return NextResponse.json(group)
  } catch (error) {
    console.error("Failed to delete group:", error)
    return NextResponse.json({ error: "Failed to delete group" }, { status: 500 })
  }
}
