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

    // Built-in assistants: only allow updating a whitelist of fields (e.g. Live Chat, prompt, model)
    const isBuiltIn = existing.isBuiltIn
    if (isBuiltIn) {
      if (model !== undefined && !isValidModel(model)) {
        return NextResponse.json(
          { error: "Invalid model selected" },
          { status: 400 }
        )
      }
      const allowedData: Record<string, unknown> = {
        updatedBy: session.user.id,
      }
      if (description !== undefined) allowedData.description = description
      if (emoji !== undefined) allowedData.emoji = emoji
      if (systemPrompt !== undefined) allowedData.systemPrompt = systemPrompt
      if (model !== undefined) allowedData.model = model
      if (memoryConfig !== undefined) allowedData.memoryConfig = memoryConfig
      if (liveChatEnabled !== undefined) allowedData.liveChatEnabled = liveChatEnabled
      // name, useKnowledgeBase, knowledgeBaseGroupIds are not allowed for built-in

      const assistant = await prisma.assistant.update({
        where: { id },
        data: allowedData,
      })
      return NextResponse.json(assistant)
    }

    // Non–built-in: verify organization ownership
    if (existing.organizationId) {
      if (!orgContext || existing.organizationId !== orgContext.organizationId) {
        return NextResponse.json(
          { error: "Assistant not found" },
          { status: 404 }
        )
      }

      if (!canEdit(orgContext.membership.role)) {
        return NextResponse.json(
          { error: "Insufficient permissions" },
          { status: 403 }
        )
      }
    }

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
