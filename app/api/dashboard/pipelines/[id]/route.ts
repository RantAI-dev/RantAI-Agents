import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import { hasPermission } from "@/lib/digital-employee/rbac"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const orgContext = await getOrganizationContextWithFallback(req, session.user.id)
    if (!orgContext) {
      return NextResponse.json({ error: "Organization required" }, { status: 400 })
    }

    const pipeline = await prisma.employeeTemplateShare.findFirst({
      where: { id, organizationId: orgContext.organizationId, category: "pipeline" },
    })

    if (!pipeline) {
      return NextResponse.json({ error: "Pipeline not found" }, { status: 404 })
    }

    const data = pipeline.templateData as Record<string, unknown>
    return NextResponse.json({
      id: pipeline.id,
      organizationId: pipeline.organizationId,
      name: pipeline.name,
      description: pipeline.description,
      steps: (data?.steps as unknown[]) || [],
      status: (data?.status as string) || "draft",
      createdBy: pipeline.createdBy,
      createdAt: pipeline.createdAt.toISOString(),
      updatedAt: pipeline.updatedAt.toISOString(),
    })
  } catch (error) {
    console.error("Failed to fetch pipeline:", error)
    return NextResponse.json({ error: "Failed to fetch pipeline" }, { status: 500 })
  }
}

export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const orgContext = await getOrganizationContextWithFallback(req, session.user.id)
    if (!orgContext) {
      return NextResponse.json({ error: "Organization required" }, { status: 400 })
    }

    const existing = await prisma.employeeTemplateShare.findFirst({
      where: { id, organizationId: orgContext.organizationId, category: "pipeline" },
    })
    if (!existing) {
      return NextResponse.json({ error: "Pipeline not found" }, { status: 404 })
    }

    const body = await req.json()
    const { name, description, steps, status } = body

    const currentData = existing.templateData as Record<string, unknown>
    const updated = await prisma.employeeTemplateShare.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        templateData: {
          steps: steps ?? currentData?.steps ?? [],
          status: status ?? currentData?.status ?? "draft",
        } as object,
        version: { increment: 1 },
      },
    })

    const updatedData = updated.templateData as Record<string, unknown>
    return NextResponse.json({
      id: updated.id,
      organizationId: updated.organizationId,
      name: updated.name,
      description: updated.description,
      steps: (updatedData?.steps as unknown[]) || [],
      status: (updatedData?.status as string) || "draft",
      createdBy: updated.createdBy,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    })
  } catch (error) {
    console.error("Failed to update pipeline:", error)
    return NextResponse.json({ error: "Failed to update pipeline" }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const orgContext = await getOrganizationContextWithFallback(req, session.user.id)
    if (!orgContext) {
      return NextResponse.json({ error: "Organization required" }, { status: 400 })
    }

    if (!hasPermission(orgContext.membership.role, "employee.delete")) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const existing = await prisma.employeeTemplateShare.findFirst({
      where: { id, organizationId: orgContext.organizationId, category: "pipeline" },
    })
    if (!existing) {
      return NextResponse.json({ error: "Pipeline not found" }, { status: 404 })
    }

    await prisma.employeeTemplateShare.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to delete pipeline:", error)
    return NextResponse.json({ error: "Failed to delete pipeline" }, { status: 500 })
  }
}
