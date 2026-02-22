import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext, canEdit } from "@/lib/organization"
import { DEFAULT_MODEL_ID, isValidModel } from "@/lib/models"

// GET /api/assistants - List all assistants
// Built-in assistants are created by seed.ts during setup (bun run setup)
export async function GET(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get organization context from header
    const orgContext = await getOrganizationContext(request, session.user.id)

    // Filter: organization-scoped assistants + built-in assistants
    const assistants = await prisma.assistant.findMany({
      where: {
        OR: [
          // Built-in assistants (global)
          { isBuiltIn: true },
          // Organization-scoped assistants
          ...(orgContext
            ? [{ organizationId: orgContext.organizationId }]
            : [{ organizationId: null }]),
        ],
      },
      include: {
        _count: { select: { tools: true } },
      },
      orderBy: [{ isBuiltIn: "desc" }, { createdAt: "asc" }],
    })

    return NextResponse.json(assistants)
  } catch (error) {
    console.error("Failed to fetch assistants:", error)
    return NextResponse.json(
      { error: "Failed to fetch assistants" },
      { status: 500 }
    )
  }
}

// POST /api/assistants - Create new assistant
export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get organization context
    const orgContext = await getOrganizationContext(request, session.user.id)

    // Check permission if organization context exists
    if (orgContext && !canEdit(orgContext.membership.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      )
    }

    // Check organization limits if creating within an org
    if (orgContext) {
      const organization = await prisma.organization.findUnique({
        where: { id: orgContext.organizationId },
        include: {
          _count: { select: { assistants: true } },
        },
      })

      if (organization && organization._count.assistants >= organization.maxAssistants) {
        return NextResponse.json(
          { error: `Organization has reached the maximum of ${organization.maxAssistants} assistants` },
          { status: 400 }
        )
      }
    }

    const body = await request.json()

    const {
      name, description, emoji, systemPrompt, model, useKnowledgeBase, knowledgeBaseGroupIds,
      memoryConfig, liveChatEnabled, modelConfig, openingMessage, openingQuestions, chatConfig, guardRails, avatarS3Key,
    } = body

    if (!name || !systemPrompt) {
      return NextResponse.json(
        { error: "Name and system prompt are required" },
        { status: 400 }
      )
    }

    // Validate model if provided
    const selectedModel = model || DEFAULT_MODEL_ID
    if (!isValidModel(selectedModel)) {
      return NextResponse.json(
        { error: "Invalid model selected" },
        { status: 400 }
      )
    }

    const assistant = await prisma.assistant.create({
      data: {
        name,
        description: description || null,
        emoji: emoji || "🤖",
        systemPrompt,
        model: selectedModel,
        useKnowledgeBase: useKnowledgeBase || false,
        knowledgeBaseGroupIds: knowledgeBaseGroupIds || [],
        ...(memoryConfig !== undefined && { memoryConfig }),
        ...(liveChatEnabled !== undefined && { liveChatEnabled }),
        ...(modelConfig !== undefined && { modelConfig }),
        ...(openingMessage !== undefined && { openingMessage }),
        ...(openingQuestions !== undefined && { openingQuestions }),
        ...(chatConfig !== undefined && { chatConfig }),
        ...(guardRails !== undefined && { guardRails }),
        ...(avatarS3Key !== undefined && { avatarS3Key }),
        isSystemDefault: false,
        isBuiltIn: false,
        organizationId: orgContext?.organizationId || null,
        createdBy: session.user.id,
      },
    })

    return NextResponse.json(assistant, { status: 201 })
  } catch (error) {
    console.error("Failed to create assistant:", error)
    return NextResponse.json(
      { error: "Failed to create assistant" },
      { status: 500 }
    )
  }
}
