import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"
import { proxyToGateway } from "@/lib/digital-employee/workspace-proxy"

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET - Read a workspace file
export async function GET(req: Request, { params }: RouteParams) {
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

    const url = new URL(req.url)
    const path = url.searchParams.get("path")
    if (!path) {
      return NextResponse.json({ error: "path is required" }, { status: 400 })
    }

    const result = await proxyToGateway(
      id,
      `/workspace/files/read?path=${encodeURIComponent(path)}`
    )

    return NextResponse.json(result.data, { status: result.status })
  } catch (err) {
    console.error("Workspace file read error:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
