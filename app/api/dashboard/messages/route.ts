import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContextWithFallback } from "@/lib/organization"

export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContextWithFallback(req, session.user.id)
    if (!orgContext) {
      return NextResponse.json({ error: "Organization required" }, { status: 400 })
    }

    const url = new URL(req.url)
    const employeeId = url.searchParams.get("employeeId")
    const type = url.searchParams.get("type")
    const status = url.searchParams.get("status")
    const cursor = url.searchParams.get("cursor")
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100)

    const where: Record<string, unknown> = {
      organizationId: orgContext.organizationId,
    }
    if (employeeId) {
      where.OR = [{ fromEmployeeId: employeeId }, { toEmployeeId: employeeId }]
    }
    if (type) where.type = type
    if (status) where.status = status

    const messages = await prisma.employeeMessage.findMany({
      where,
      include: {
        fromEmployee: { select: { id: true, name: true, avatar: true } },
        toEmployee: { select: { id: true, name: true, avatar: true } },
        childMessages: {
          select: { id: true, content: true, fromEmployeeId: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })

    const hasMore = messages.length > limit
    const items = hasMore ? messages.slice(0, limit) : messages

    return NextResponse.json({
      messages: items,
      nextCursor: hasMore ? items[items.length - 1].id : null,
    })
  } catch (error) {
    console.error("Failed to fetch messages:", error)
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 })
  }
}
