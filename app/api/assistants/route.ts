import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext, canEdit } from "@/lib/organization"
import {
  HORIZON_LIFE_SYSTEM_PROMPT,
  HORIZON_LIFE_KB_GROUP_ID,
  CODE_ASSISTANT_PROMPT,
  CREATIVE_WRITER_PROMPT,
  DATA_ANALYST_PROMPT,
  RESEARCH_ASSISTANT_PROMPT,
} from "@/lib/assistants/defaults"
import { DEFAULT_MODEL_ID, isValidModel } from "@/lib/models"

// Built-in assistants to seed if table is empty
const BUILT_IN_ASSISTANTS = [
  {
    id: "horizon-life",
    name: "Horizon Life Assistant",
    description: "Insurance expert for HorizonLife",
    emoji: "🏠",
    systemPrompt: HORIZON_LIFE_SYSTEM_PROMPT,
    useKnowledgeBase: true,
    knowledgeBaseGroupIds: [HORIZON_LIFE_KB_GROUP_ID],
    isSystemDefault: true,
    isBuiltIn: true,
  },
  {
    id: "general",
    name: "Just Chat",
    description: "General conversation assistant",
    emoji: "💬",
    systemPrompt:
      "You are a helpful assistant. Be concise, friendly, and informative.",
    model: "google/gemini-3-flash-preview",
    useKnowledgeBase: false,
    knowledgeBaseGroupIds: [],
    isSystemDefault: false,
    isBuiltIn: true,
  },
  {
    id: "code-assistant",
    name: "Code Assistant",
    description: "Coding help, debugging, and code review",
    emoji: "👨‍💻",
    systemPrompt: CODE_ASSISTANT_PROMPT,
    model: "google/gemini-3-flash-preview",
    useKnowledgeBase: false,
    knowledgeBaseGroupIds: [],
    isSystemDefault: false,
    isBuiltIn: true,
  },
  {
    id: "creative-writer",
    name: "Creative Writer",
    description: "Writing, storytelling, and content creation",
    emoji: "✍️",
    systemPrompt: CREATIVE_WRITER_PROMPT,
    model: "google/gemini-3-flash-preview",
    useKnowledgeBase: false,
    knowledgeBaseGroupIds: [],
    isSystemDefault: false,
    isBuiltIn: true,
  },
  {
    id: "data-analyst",
    name: "Data Analyst",
    description: "Data analysis, charts, and spreadsheets",
    emoji: "📊",
    systemPrompt: DATA_ANALYST_PROMPT,
    model: "google/gemini-3-flash-preview",
    useKnowledgeBase: false,
    knowledgeBaseGroupIds: [],
    isSystemDefault: false,
    isBuiltIn: true,
  },
  {
    id: "research-assistant",
    name: "Research Assistant",
    description: "Research, summarization, and fact-finding",
    emoji: "🔍",
    systemPrompt: RESEARCH_ASSISTANT_PROMPT,
    model: "google/gemini-3-flash-preview",
    useKnowledgeBase: false,
    knowledgeBaseGroupIds: [],
    isSystemDefault: false,
    isBuiltIn: true,
  },
]

// Ensure built-in assistants exist (upserts missing ones)
async function ensureBuiltInAssistants() {
  const existing = await prisma.assistant.findMany({
    where: { isBuiltIn: true },
    select: { id: true },
  })
  const existingIds = new Set(existing.map((a) => a.id))

  for (const assistant of BUILT_IN_ASSISTANTS) {
    if (!existingIds.has(assistant.id)) {
      await prisma.assistant.upsert({
        where: { id: assistant.id },
        update: {},
        create: assistant,
      })
    }
  }
}

// GET /api/assistants - List all assistants
export async function GET(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await ensureBuiltInAssistants()

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

    const { name, description, emoji, systemPrompt, model, useKnowledgeBase, knowledgeBaseGroupIds, memoryConfig, liveChatEnabled } =
      body

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
