import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import { hasPermission } from "@/lib/digital-employee/rbac"

interface RouteParams {
  params: Promise<{ id: string }>
}

// PUT /api/dashboard/templates/:id
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
      where: { id, organizationId: orgContext.organizationId },
    })
    if (!existing) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 })
    }

    // Only creator or admin can update
    if (existing.createdBy !== session.user.id && !hasPermission(orgContext.membership.role, "employee.delete")) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const body = await req.json()
    const { name, description, category, templateData, isPublic } = body

    const canMakePublic = hasPermission(orgContext.membership.role, "employee.delete")
    const updated = await prisma.employeeTemplateShare.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(category && { category }),
        ...(templateData && { templateData: templateData as object }),
        ...(isPublic !== undefined && canMakePublic && { isPublic }),
        version: { increment: 1 },
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Failed to update template:", error)
    return NextResponse.json({ error: "Failed to update template" }, { status: 500 })
  }
}

// DELETE /api/dashboard/templates/:id
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

    const existing = await prisma.employeeTemplateShare.findFirst({
      where: { id, organizationId: orgContext.organizationId },
    })
    if (!existing) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 })
    }

    if (existing.createdBy !== session.user.id && !hasPermission(orgContext.membership.role, "employee.delete")) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    await prisma.employeeTemplateShare.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to delete template:", error)
    return NextResponse.json({ error: "Failed to delete template" }, { status: 500 })
  }
}
