import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext, canEdit, canManage } from "@/lib/organization"
import { isValidModel } from "@/lib/models"

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/assistants/[id] - Get single assistant
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const orgContext = await getOrganizationContext(request, session.user.id)

    const assistant = await prisma.assistant.findUnique({
      where: { id },
    })

    if (!assistant) {
      return NextResponse.json(
        { error: "Assistant not found" },
        { status: 404 }
      )
    }

    // Allow access to built-in assistants or assistants in user's organization
    if (!assistant.isBuiltIn && assistant.organizationId) {
      if (!orgContext || assistant.organizationId !== orgContext.organizationId) {
        return NextResponse.json(
          { error: "Assistant not found" },
          { status: 404 }
        )
      }
    }

    return NextResponse.json(assistant)
  } catch (error) {
    console.error("Failed to fetch assistant:", error)
    return NextResponse.json(
      { error: "Failed to fetch assistant" },
      { status: 500 }
    )
  }
}

// PUT /api/assistants/[id] - Update assistant
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const orgContext = await getOrganizationContext(request, session.user.id)

    const existing = await prisma.assistant.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json(
        { error: "Assistant not found" },
        { status: 404 }
      )
    }

    // Cannot edit built-in assistants
    if (existing.isBuiltIn) {
      return NextResponse.json(
        { error: "Cannot edit built-in assistants" },
        { status: 403 }
      )
    }

    // Verify organization ownership
    if (existing.organizationId) {
      if (!orgContext || existing.organizationId !== orgContext.organizationId) {
        return NextResponse.json(
          { error: "Assistant not found" },
          { status: 404 }
        )
      }

      // Check edit permission
      if (!canEdit(orgContext.membership.role)) {
        return NextResponse.json(
          { error: "Insufficient permissions" },
          { status: 403 }
        )
      }
    }

    const body = await request.json()
    const {
      name,
      description,
      emoji,
      systemPrompt,
      model,
      useKnowledgeBase,
      knowledgeBaseGroupIds,
      memoryConfig,
      liveChatEnabled,
    } = body

    // Validate model if provided
    if (model !== undefined && !isValidModel(model)) {
      return NextResponse.json(
        { error: "Invalid model selected" },
        { status: 400 }
      )
    }

    const assistant = await prisma.assistant.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(emoji !== undefined && { emoji }),
        ...(systemPrompt !== undefined && { systemPrompt }),
        ...(model !== undefined && { model }),
        ...(useKnowledgeBase !== undefined && { useKnowledgeBase }),
        ...(knowledgeBaseGroupIds !== undefined && { knowledgeBaseGroupIds }),
        ...(memoryConfig !== undefined && { memoryConfig }),
        ...(liveChatEnabled !== undefined && { liveChatEnabled }),
        updatedBy: session.user.id,
      },
    })

    return NextResponse.json(assistant)
  } catch (error) {
    console.error("Failed to update assistant:", error)
    return NextResponse.json(
      { error: "Failed to update assistant" },
      { status: 500 }
    )
  }
}

// DELETE /api/assistants/[id] - Delete assistant
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const orgContext = await getOrganizationContext(request, session.user.id)

    const existing = await prisma.assistant.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json(
        { error: "Assistant not found" },
        { status: 404 }
      )
    }

    if (existing.isBuiltIn) {
      return NextResponse.json(
        { error: "Cannot delete built-in assistants" },
        { status: 403 }
      )
    }

    // Verify organization ownership
    if (existing.organizationId) {
      if (!orgContext || existing.organizationId !== orgContext.organizationId) {
        return NextResponse.json(
          { error: "Assistant not found" },
          { status: 404 }
        )
      }

      // Only owner and admin can delete
      if (!canManage(orgContext.membership.role)) {
        return NextResponse.json(
          { error: "Insufficient permissions" },
          { status: 403 }
        )
      }
    }

    await prisma.assistant.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to delete assistant:", error)
    return NextResponse.json(
      { error: "Failed to delete assistant" },
      { status: 500 }
    )
  }
}
