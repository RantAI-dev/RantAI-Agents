import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { canManage, getOrganizationContext } from "@/lib/organization"
import {
  UpdateDashboardMcpApiKeySchema,
} from "@/features/mcp/api-keys/schema"
import {
  deleteDashboardMcpApiKeyRecord,
  getDashboardMcpApiKey,
  updateDashboardMcpApiKeyRecord,
} from "@/features/mcp/api-keys/service"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)
    if (orgContext && !canManage(orgContext.membership.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      )
    }

    const result = await getDashboardMcpApiKey(
      {
        organizationId: orgContext?.organizationId ?? null,
        role: orgContext?.membership.role ?? null,
        userId: session.user.id,
      },
      id
    )
    if ("status" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[MCP API Keys] GET [id] error:", error)
    return NextResponse.json(
      { error: "Failed to fetch MCP API key" },
      { status: 500 }
    )
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)
    if (orgContext && !canManage(orgContext.membership.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      )
    }

    const parsed = UpdateDashboardMcpApiKeySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const result = await updateDashboardMcpApiKeyRecord({
      context: {
        organizationId: orgContext?.organizationId ?? null,
        role: orgContext?.membership.role ?? null,
        userId: session.user.id,
      },
      id,
      input: parsed.data,
    })
    if ("status" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[MCP API Keys] PUT error:", error)
    return NextResponse.json(
      { error: "Failed to update MCP API key" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)
    if (orgContext && !canManage(orgContext.membership.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      )
    }

    const result = await deleteDashboardMcpApiKeyRecord(
      {
        organizationId: orgContext?.organizationId ?? null,
        role: orgContext?.membership.role ?? null,
        userId: session.user.id,
      },
      id
    )
    if ("status" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[MCP API Keys] DELETE error:", error)
    return NextResponse.json(
      { error: "Failed to delete MCP API key" },
      { status: 500 }
    )
  }
}
