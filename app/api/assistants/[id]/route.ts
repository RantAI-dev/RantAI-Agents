import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/assistants/[id] - Get single assistant
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params

    const assistant = await prisma.assistant.findUnique({
      where: { id },
    })

    if (!assistant) {
      return NextResponse.json(
        { error: "Assistant not found" },
        { status: 404 }
      )
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
    const { id } = await params
    const body = await request.json()

    const existing = await prisma.assistant.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json(
        { error: "Assistant not found" },
        { status: 404 }
      )
    }

    const {
      name,
      description,
      emoji,
      systemPrompt,
      useKnowledgeBase,
      knowledgeBaseGroupIds,
    } = body

    const assistant = await prisma.assistant.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(emoji !== undefined && { emoji }),
        ...(systemPrompt !== undefined && { systemPrompt }),
        ...(useKnowledgeBase !== undefined && { useKnowledgeBase }),
        ...(knowledgeBaseGroupIds !== undefined && { knowledgeBaseGroupIds }),
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
    const { id } = await params

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
