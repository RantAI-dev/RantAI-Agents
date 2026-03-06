import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET - List custom tools
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
    })

    if (!employee) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const tools = await prisma.employeeCustomTool.findMany({
      where: { digitalEmployeeId: id },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json(tools)
  } catch (error) {
    console.error("Failed to fetch custom tools:", error)
    return NextResponse.json({ error: "Failed to fetch custom tools" }, { status: 500 })
  }
}

// POST - Create custom tool
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
    })

    if (!employee) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const { name, description, parameters, code, language } = await req.json()

    if (!name || !code) {
      return NextResponse.json({ error: "Name and code are required" }, { status: 400 })
    }

    // Auto-approve if autonomous, otherwise require approval
    const approved = employee.autonomyLevel === "autonomous"

    const tool = await prisma.employeeCustomTool.create({
      data: {
        digitalEmployeeId: id,
        name,
        description: description || null,
        parameters: parameters || {},
        code,
        language: language || "javascript",
        approved,
        createdBy: session.user.id,
      },
    })

    return NextResponse.json(tool, { status: 201 })
  } catch (error) {
    console.error("Failed to create custom tool:", error)
    return NextResponse.json({ error: "Failed to create custom tool" }, { status: 500 })
  }
}
