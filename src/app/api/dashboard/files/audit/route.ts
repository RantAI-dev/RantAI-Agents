import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { resolveActiveOrg } from "@/lib/org-context"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/dashboard/files/audit?entityType=document&entityId=<id>&limit=50
 *
 * Returns audit log entries scoped to the caller's org. Filters:
 *   - entityType: document | category | knowledgeBaseGroup
 *   - entityId: specific entity (matched against the "<entityType>:<id>" resource)
 *   - action: e.g. "document.delete" (substring match)
 *   - limit: max rows (default 50, max 500)
 */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const orgContext = await resolveActiveOrg(request, session.user.id)
    if (!orgContext?.organizationId) {
      return NextResponse.json({ events: [] })
    }

    const url = new URL(request.url)
    const entityType = url.searchParams.get("entityType")
    const entityId = url.searchParams.get("entityId")
    const action = url.searchParams.get("action")
    const rawLimit = parseInt(url.searchParams.get("limit") ?? "50", 10)
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 50, 1), 500)

    const resource = entityType
      ? entityId
        ? `${entityType}:${entityId}`
        : { startsWith: `${entityType}:` }
      : undefined

    const events = await prisma.auditLog.findMany({
      where: {
        organizationId: orgContext.organizationId,
        ...(resource !== undefined && { resource: resource as never }),
        ...(action !== null && { action: { contains: action } }),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        action: true,
        resource: true,
        detail: true,
        userId: true,
        riskLevel: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ events })
  } catch (error) {
    console.error("Failed to query audit log:", error)
    return NextResponse.json({ error: "Failed to query audit log" }, { status: 500 })
  }
}
