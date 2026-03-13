import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"
import { proxyToGateway } from "@/lib/digital-employee/workspace-proxy"

interface RouteParams {
  params: Promise<{ id: string }>
}

// POST - Write a workspace file
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
    if (!body.path || typeof body.content !== "string") {
      return NextResponse.json(
        { error: "path and content are required" },
        { status: 400 }
      )
    }

    const result = await proxyToGateway(id, "/workspace/files/write", {
      method: "POST",
      body: { path: body.path, content: body.content },
    })

    return NextResponse.json(result.data, { status: result.status })
  } catch (err) {
    console.error("Workspace file write error:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
