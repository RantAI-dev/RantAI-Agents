import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  HORIZON_LIFE_SYSTEM_PROMPT,
  HORIZON_LIFE_KB_GROUP_ID,
} from "@/lib/assistants/defaults"

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
    useKnowledgeBase: false,
    knowledgeBaseGroupIds: [],
    isSystemDefault: false,
    isBuiltIn: true,
  },
]

// Ensure built-in assistants exist
async function ensureBuiltInAssistants() {
  const existingCount = await prisma.assistant.count({
    where: { isBuiltIn: true },
  })

  if (existingCount === 0) {
    for (const assistant of BUILT_IN_ASSISTANTS) {
      await prisma.assistant.upsert({
        where: { id: assistant.id },
        update: {},
        create: assistant,
      })
    }
  }
}

// GET /api/assistants - List all assistants
export async function GET() {
  try {
    await ensureBuiltInAssistants()

    const assistants = await prisma.assistant.findMany({
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
    const body = await request.json()

    const { name, description, emoji, systemPrompt, useKnowledgeBase, knowledgeBaseGroupIds } =
      body

    if (!name || !systemPrompt) {
      return NextResponse.json(
        { error: "Name and system prompt are required" },
        { status: 400 }
      )
    }

    const assistant = await prisma.assistant.create({
      data: {
        name,
        description: description || null,
        emoji: emoji || "🤖",
        systemPrompt,
        useKnowledgeBase: useKnowledgeBase || false,
        knowledgeBaseGroupIds: knowledgeBaseGroupIds || [],
        isSystemDefault: false,
        isBuiltIn: false,
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
