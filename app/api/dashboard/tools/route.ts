import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import { CreateToolSchema } from "@/src/features/tools/schema"
import {
  createDashboardTool,
  listToolsForDashboard,
} from "@/src/features/tools/service"

// GET /api/dashboard/tools - List all tools
export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const tools = await listToolsForDashboard(orgContext?.organizationId ?? null)
    return NextResponse.json(tools)
  } catch (error) {
    console.error("[Tools API] GET error:", error)
    return NextResponse.json(
      { error: "Failed to fetch tools" },
      { status: 500 }
    )
  }
}

// POST /api/dashboard/tools - Create custom tool
export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const parsed = CreateToolSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const tool = await createDashboardTool({
      input: parsed.data,
      organizationId: orgContext?.organizationId ?? null,
      createdBy: session.user.id,
    })

    return NextResponse.json(tool, { status: 201 })
  } catch (error) {
    console.error("[Tools API] POST error:", error)
    return NextResponse.json(
      { error: "Failed to create tool" },
      { status: 500 }
    )
  }
}
