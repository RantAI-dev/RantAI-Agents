import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"
import { hasPermission } from "@/lib/digital-employee/rbac"

// GET /api/dashboard/templates — list org + public shared templates
export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    if (!orgContext) {
      return NextResponse.json({ error: "Organization required" }, { status: 400 })
    }

    const templates = await prisma.employeeTemplateShare.findMany({
      where: {
        OR: [
          { organizationId: orgContext.organizationId },
          { isPublic: true },
        ],
      },
      orderBy: { updatedAt: "desc" },
    })

    return NextResponse.json(templates)
  } catch (error) {
    console.error("Failed to fetch templates:", error)
    return NextResponse.json({ error: "Failed to fetch templates" }, { status: 500 })
  }
}

// POST /api/dashboard/templates — save employee config as template
export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    if (!orgContext) {
      return NextResponse.json({ error: "Organization required" }, { status: 400 })
    }

    if (!hasPermission(orgContext.membership.role, "employee.create")) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const body = await req.json()
    const { name, description, category, templateData, isPublic } = body

    if (!name || !category || !templateData) {
      return NextResponse.json({ error: "name, category, and templateData are required" }, { status: 400 })
    }

    // Only admin/owner can make templates public
    const canMakePublic = hasPermission(orgContext.membership.role, "employee.delete") // admin+ permission
    const template = await prisma.employeeTemplateShare.create({
      data: {
        organizationId: orgContext.organizationId,
        name,
        description: description || null,
        category,
        templateData: templateData as object,
        isPublic: canMakePublic && isPublic ? true : false,
        createdBy: session.user.id,
      },
    })

    return NextResponse.json(template, { status: 201 })
  } catch (error) {
    console.error("Failed to create template:", error)
    return NextResponse.json({ error: "Failed to create template" }, { status: 500 })
  }
}
