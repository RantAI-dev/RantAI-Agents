import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { canManage, getOrganizationContext } from "@/lib/organization"
import {
  CreateDashboardMcpApiKeySchema,
} from "@/src/features/mcp/api-keys/schema"
import {
  createDashboardMcpApiKeyRecord,
  listDashboardMcpApiKeys,
} from "@/src/features/mcp/api-keys/service"

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

    const result = await listDashboardMcpApiKeys({
      organizationId: orgContext?.organizationId ?? null,
      role: orgContext?.membership.role ?? null,
      userId: session.user.id,
    })
    if ("status" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[MCP API Keys] GET error:", error)
    return NextResponse.json(
      { error: "Failed to fetch MCP API keys" },
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

    if (!orgContext) {
      return NextResponse.json(
        { error: "Organization context required" },
        { status: 400 }
      )
    }

    const parsed = CreateDashboardMcpApiKeySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const result = await createDashboardMcpApiKeyRecord({
      context: {
        organizationId: orgContext.organizationId,
        role: orgContext.membership.role,
        userId: session.user.id,
      },
      input: parsed.data,
    })
    if ("status" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error("[MCP API Keys] POST error:", error)
    return NextResponse.json(
      { error: "Failed to create MCP API key" },
      { status: 500 }
    )
  }
}
