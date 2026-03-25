import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { canManage, getOrganizationContext } from "@/lib/organization"
import {
  CreateDashboardEmbedKeySchema,
} from "@/src/features/embed-keys/schema"
import {
  createDashboardEmbedKey,
  listDashboardEmbedKeys,
} from "@/src/features/embed-keys/service"

export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    if (orgContext && !canManage(orgContext.membership.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      )
    }

    const result = await listDashboardEmbedKeys({
      organizationId: orgContext?.organizationId ?? null,
      role: orgContext?.membership.role ?? null,
      userId: session.user.id,
    })
    if ("status" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Embed Keys API] GET error:", error)
    return NextResponse.json(
      { error: "Failed to fetch embed keys" },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    if (orgContext && !canManage(orgContext.membership.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      )
    }

    const parsed = CreateDashboardEmbedKeySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const result = await createDashboardEmbedKey({
      context: {
        organizationId: orgContext?.organizationId ?? null,
        role: orgContext?.membership.role ?? null,
        userId: session.user.id,
      },
      input: parsed.data,
    })
    if ("status" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error("[Embed Keys API] POST error:", error)
    return NextResponse.json(
      { error: "Failed to create embed key" },
      { status: 500 }
    )
  }
}
