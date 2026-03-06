import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET - List platform tools (from assistant) + custom tools
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
      include: {
        assistant: {
          include: {
            tools: { where: { enabled: true }, include: { tool: true } },
          },
        },
        customTools: { orderBy: { createdAt: "desc" } },
      },
    })

    if (!employee) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json({
      platform: (employee.assistant?.tools ?? []).map((at) => ({
        id: at.tool.id,
        name: at.tool.name,
        displayName: at.tool.displayName,
        description: at.tool.description,
        category: at.tool.category,
        icon: at.tool.icon,
        isBuiltIn: at.tool.isBuiltIn,
        enabled: at.enabled,
      })),
      custom: employee.customTools,
    })
  } catch (error) {
    console.error("Failed to fetch tools:", error)
    return NextResponse.json({ error: "Failed to fetch tools" }, { status: 500 })
  }
}
