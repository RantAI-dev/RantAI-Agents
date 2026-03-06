import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"

interface RouteParams {
  params: Promise<{ id: string; toolId: string }>
}

// GET - Single custom tool
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id, toolId } = await params
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

    const tool = await prisma.employeeCustomTool.findFirst({
      where: { id: toolId, digitalEmployeeId: id },
    })

    if (!tool) {
      return NextResponse.json({ error: "Tool not found" }, { status: 404 })
    }

    return NextResponse.json(tool)
  } catch (error) {
    console.error("Failed to fetch custom tool:", error)
    return NextResponse.json({ error: "Failed to fetch custom tool" }, { status: 500 })
  }
}

// PUT - Update custom tool
export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id, toolId } = await params
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

    const body = await req.json()

    const tool = await prisma.employeeCustomTool.update({
      where: { id: toolId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.parameters !== undefined && { parameters: body.parameters }),
        ...(body.code !== undefined && { code: body.code }),
        ...(body.language !== undefined && { language: body.language }),
        ...(body.enabled !== undefined && { enabled: body.enabled }),
        ...(body.approved !== undefined && { approved: body.approved }),
      },
    })

    return NextResponse.json(tool)
  } catch (error) {
    console.error("Failed to update custom tool:", error)
    return NextResponse.json({ error: "Failed to update custom tool" }, { status: 500 })
  }
}

// DELETE - Delete custom tool
export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id, toolId } = await params
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

    await prisma.employeeCustomTool.delete({ where: { id: toolId } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to delete custom tool:", error)
    return NextResponse.json({ error: "Failed to delete custom tool" }, { status: 500 })
  }
}
