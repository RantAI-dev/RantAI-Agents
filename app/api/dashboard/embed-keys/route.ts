import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { generateApiKey } from "@/lib/embed"
import { DEFAULT_WIDGET_CONFIG, type WidgetConfig } from "@/lib/embed/types"

// GET /api/dashboard/embed-keys - List all API keys
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const keys = await prisma.embedApiKey.findMany({
      orderBy: { createdAt: "desc" },
    })

    // Fetch assistant info for each key
    const assistantIds = [...new Set(keys.map((k) => k.assistantId))]
    const assistants = await prisma.assistant.findMany({
      where: { id: { in: assistantIds } },
      select: { id: true, name: true, emoji: true },
    })

    const assistantMap = new Map(assistants.map((a) => [a.id, a]))

    const response = keys.map((key) => ({
      id: key.id,
      name: key.name,
      key: key.key, // Full key shown only in list for copying
      assistantId: key.assistantId,
      allowedDomains: key.allowedDomains,
      config: { ...DEFAULT_WIDGET_CONFIG, ...(key.config as object) },
      requestCount: key.requestCount,
      lastUsedAt: key.lastUsedAt?.toISOString() || null,
      enabled: key.enabled,
      createdAt: key.createdAt.toISOString(),
      updatedAt: key.updatedAt.toISOString(),
      assistant: assistantMap.get(key.assistantId) || null,
    }))

    return NextResponse.json(response)
  } catch (error) {
    console.error("[Embed Keys API] GET error:", error)
    return NextResponse.json(
      { error: "Failed to fetch embed keys" },
      { status: 500 }
    )
  }
}

// POST /api/dashboard/embed-keys - Create new API key
export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { name, assistantId, allowedDomains, config } = body

    if (!name || !assistantId) {
      return NextResponse.json(
        { error: "Name and assistantId are required" },
        { status: 400 }
      )
    }

    // Verify assistant exists
    const assistant = await prisma.assistant.findUnique({
      where: { id: assistantId },
      select: { id: true, name: true, emoji: true },
    })

    if (!assistant) {
      return NextResponse.json(
        { error: "Assistant not found" },
        { status: 404 }
      )
    }

    // Generate unique API key
    const apiKey = generateApiKey()

    // Merge config with defaults
    const mergedConfig: WidgetConfig = {
      ...DEFAULT_WIDGET_CONFIG,
      ...(config || {}),
    }

    const embedKey = await prisma.embedApiKey.create({
      data: {
        name,
        key: apiKey,
        assistantId,
        allowedDomains: allowedDomains || [],
        config: mergedConfig as object,
        enabled: true,
      },
    })

    return NextResponse.json({
      id: embedKey.id,
      name: embedKey.name,
      key: embedKey.key, // Full key returned on creation
      assistantId: embedKey.assistantId,
      allowedDomains: embedKey.allowedDomains,
      config: mergedConfig,
      requestCount: embedKey.requestCount,
      lastUsedAt: null,
      enabled: embedKey.enabled,
      createdAt: embedKey.createdAt.toISOString(),
      updatedAt: embedKey.updatedAt.toISOString(),
      assistant,
    })
  } catch (error) {
    console.error("[Embed Keys API] POST error:", error)
    return NextResponse.json(
      { error: "Failed to create embed key" },
      { status: 500 }
    )
  }
}
