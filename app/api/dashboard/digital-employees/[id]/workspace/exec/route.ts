import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"
import { proxyToGateway } from "@/lib/digital-employee/workspace-proxy"

interface RouteParams {
  params: Promise<{ id: string }>
}

// POST - Execute a shell command in the employee workspace
export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)

    const employee = await prisma.digitalEmployee.findFirst({
      where: {
        id,
        ...(orgContext ? { organizationId: orgContext.organizationId } : {}),
      },
      select: { id: true },
    })

    if (!employee) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const body = await req.json()
    if (!body.command || typeof body.command !== "string") {
      return NextResponse.json(
        { error: "command is required" },
        { status: 400 }
      )
    }

    const result = await proxyToGateway(id, "/workspace/exec", {
      method: "POST",
      body: { command: body.command, cwd: body.cwd },
      timeout: 35000, // slightly longer than the gateway's 30s timeout
    })

    return NextResponse.json(result.data, { status: result.status })
  } catch (err) {
    console.error("Workspace exec error:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
