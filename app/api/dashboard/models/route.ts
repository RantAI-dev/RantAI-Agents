import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { AVAILABLE_MODELS } from "@/lib/models"

/**
 * GET /api/dashboard/models — Returns all active LLM models.
 *
 * Query params:
 *   ?free=true   — only free models
 *   ?tools=true  — only models with tool-calling support
 *
 * Falls back to static AVAILABLE_MODELS if DB is empty (first run before sync).
 */
export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const url = new URL(req.url)
    const freeOnly = url.searchParams.get("free") === "true"
    const toolsOnly = url.searchParams.get("tools") === "true"

    const where: Record<string, unknown> = { isActive: true }
    if (freeOnly) where.isFree = true
    if (toolsOnly) where.hasToolCalling = true

    const models = await prisma.llmModel.findMany({
      where,
      orderBy: [{ provider: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        provider: true,
        providerSlug: true,
        description: true,
        contextWindow: true,
        pricingInput: true,
        pricingOutput: true,
        hasVision: true,
        hasToolCalling: true,
        hasStreaming: true,
        isFree: true,
        isTrackedLab: true,
      },
    })

    // Fallback to static list if DB is empty (first run before sync)
    if (models.length === 0) {
      const staticModels = AVAILABLE_MODELS.filter((m) => {
        if (freeOnly && !(m.pricing.input === 0 && m.pricing.output === 0)) return false
        if (toolsOnly && !m.capabilities.functionCalling) return false
        return true
      }).map((m) => ({
        id: m.id,
        name: m.name,
        provider: m.provider,
        providerSlug: m.id.split("/")[0],
        description: m.description,
        contextWindow: m.contextWindow,
        pricingInput: m.pricing.input,
        pricingOutput: m.pricing.output,
        hasVision: m.capabilities.vision,
        hasToolCalling: m.capabilities.functionCalling,
        hasStreaming: m.capabilities.streaming,
        isFree: m.pricing.input === 0 && m.pricing.output === 0,
        isTrackedLab: true,
      }))
      return NextResponse.json(staticModels)
    }

    return NextResponse.json(models)
  } catch (error) {
    console.error("Error fetching models:", error)
    return NextResponse.json(
      { error: "Failed to fetch models" },
      { status: 500 }
    )
  }
}
