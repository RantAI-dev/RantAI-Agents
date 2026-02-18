import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { clearSemanticMemory } from "@/lib/memory/semantic-memory"
import { clearUserProfile } from "@/lib/memory/long-term-memory"

// GET /api/dashboard/memory — List memories + stats for current user
export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    const url = new URL(req.url)
    const type = url.searchParams.get("type") // WORKING, SEMANTIC, LONG_TERM, or null for all

    const where: Record<string, unknown> = { userId }
    if (type) {
      where.type = type
    }

    const [memories, counts] = await Promise.all([
      prisma.userMemory.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take: 100,
      }),
      prisma.userMemory.groupBy({
        by: ["type"],
        where: { userId },
        _count: true,
      }),
    ])

    const stats = {
      working: 0,
      semantic: 0,
      longTerm: 0,
      total: 0,
    }
    for (const c of counts) {
      if (c.type === "WORKING") stats.working = c._count
      else if (c.type === "SEMANTIC") stats.semantic = c._count
      else if (c.type === "LONG_TERM") stats.longTerm = c._count
      stats.total += c._count
    }

    return NextResponse.json({
      memories: memories.map((m) => ({
        id: m.id,
        type: m.type,
        key: m.key,
        value: m.value,
        confidence: m.confidence,
        source: m.source,
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
        expiresAt: m.expiresAt?.toISOString() ?? null,
      })),
      stats,
    })
  } catch (error) {
    console.error("[Memory API] GET error:", error)
    return NextResponse.json(
      { error: "Failed to fetch memories" },
      { status: 500 }
    )
  }
}

// DELETE /api/dashboard/memory — Bulk clear by type
export async function DELETE(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    const body = await req.json()
    const { type } = body as { type: string }

    if (!type || !["WORKING", "SEMANTIC", "LONG_TERM"].includes(type)) {
      return NextResponse.json(
        { error: "type must be WORKING, SEMANTIC, or LONG_TERM" },
        { status: 400 }
      )
    }

    if (type === "WORKING") {
      await prisma.userMemory.deleteMany({
        where: { userId, type: "WORKING" },
      })
    } else if (type === "SEMANTIC") {
      // Clear both PG entries and SurrealDB vectors
      await prisma.userMemory.deleteMany({
        where: { userId, type: "SEMANTIC" },
      })
      try {
        await clearSemanticMemory(userId)
      } catch (err) {
        console.error("[Memory API] SurrealDB clear error (non-fatal):", err)
      }
    } else if (type === "LONG_TERM") {
      await clearUserProfile(userId)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Memory API] DELETE error:", error)
    return NextResponse.json(
      { error: "Failed to clear memories" },
      { status: 500 }
    )
  }
}
