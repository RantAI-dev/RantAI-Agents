import { NextResponse } from "next/server"

import { AVAILABLE_MODELS } from "@/lib/models"
import { getRequestUserId } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/mobile/models — slim list of active LLM models for the agent
 * builder's model dropdown. Falls back to the static AVAILABLE_MODELS list when
 * the DB hasn't been synced yet.
 *
 * Query: ?tools=true to only return models that support function calling.
 */
export async function GET(request: Request) {
  try {
    const userId = await getRequestUserId(request)
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const toolsOnly = new URL(request.url).searchParams.get("tools") === "true"

    const where: Record<string, unknown> = { isActive: true }
    if (toolsOnly) where.hasToolCalling = true

    const models = await prisma.llmModel.findMany({
      where,
      orderBy: [{ provider: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        provider: true,
        hasToolCalling: true,
        isFree: true,
      },
    })

    if (models.length > 0) {
      return NextResponse.json(models)
    }

    // Fallback: static list before the first model sync.
    const staticModels = AVAILABLE_MODELS.filter(
      (m) => !toolsOnly || m.capabilities.functionCalling
    ).map((m) => ({
      id: m.id,
      name: m.name,
      provider: m.provider,
      hasToolCalling: m.capabilities.functionCalling,
      isFree: m.pricing.input === 0 && m.pricing.output === 0,
    }))

    return NextResponse.json(staticModels)
  } catch (error) {
    console.error("[Mobile Models API] GET error:", error)
    return NextResponse.json({ error: "Failed to fetch models" }, { status: 500 })
  }
}
