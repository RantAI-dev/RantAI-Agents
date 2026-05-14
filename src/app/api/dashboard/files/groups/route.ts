import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { resolveActiveOrg } from "@/lib/org-context"
import {
  KnowledgeGroupCreateSchema,
} from "@/features/knowledge/groups/schema"
import {
  createKnowledgeGroupForDashboard,
  listKnowledgeGroupsForDashboard,
} from "@/features/knowledge/groups/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"
import { prisma } from "@/lib/prisma"

// GET - List all groups
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const orgContext = await resolveActiveOrg(request, session.user.id)
    const orgId = orgContext?.organizationId ?? null
    const groups = await listKnowledgeGroupsForDashboard(orgId)

    const totalDocumentCount = await prisma.document.count({
      where: orgId
        ? {
            OR: [{ organizationId: orgId }, { organizationId: null }],
          }
        : {},
    })

    return NextResponse.json({ groups, totalDocumentCount })
  } catch (error) {
    console.error("Failed to list groups:", error)
    return NextResponse.json({ error: "Failed to list groups" }, { status: 500 })
  }
}

// POST - Create a new group
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const orgContext = await resolveActiveOrg(request, session.user.id)
    const parsedBody = KnowledgeGroupCreateSchema.safeParse(await request.json())
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid request payload", details: parsedBody.error.flatten() }, { status: 400 })
    }

    const group = await createKnowledgeGroupForDashboard({
      organizationId: orgContext?.organizationId ?? null,
      role: orgContext?.role ?? null,
      userId: session.user.id,
      input: parsedBody.data,
    })

    if (isHttpServiceError(group)) {
      return NextResponse.json({ error: group.error }, { status: group.status })
    }

    return NextResponse.json(group)
  } catch (error) {
    console.error("Failed to create group:", error)
    return NextResponse.json({ error: "Failed to create group" }, { status: 500 })
  }
}
