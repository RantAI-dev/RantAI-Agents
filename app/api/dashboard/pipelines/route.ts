import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import { hasPermission } from "@/lib/digital-employee/rbac"

// Pipelines are stored as EmployeeTemplateShare records with category="pipeline".
// templateData holds { steps, status } as JSON.

export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContextWithFallback(req, session.user.id)
    if (!orgContext) {
      return NextResponse.json({ error: "Organization required" }, { status: 400 })
    }

    const pipelines = await prisma.employeeTemplateShare.findMany({
      where: {
        organizationId: orgContext.organizationId,
        category: "pipeline",
      },
      orderBy: { updatedAt: "desc" },
    })

    const result = pipelines.map((p) => ({
      id: p.id,
      organizationId: p.organizationId,
      name: p.name,
      description: p.description,
      steps: ((p.templateData as Record<string, unknown>)?.steps as unknown[]) || [],
      status: ((p.templateData as Record<string, unknown>)?.status as string) || "draft",
      createdBy: p.createdBy,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to fetch pipelines:", error)
    return NextResponse.json({ error: "Failed to fetch pipelines" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContextWithFallback(req, session.user.id)
    if (!orgContext) {
      return NextResponse.json({ error: "Organization required" }, { status: 400 })
    }

    if (!hasPermission(orgContext.membership.role, "employee.create")) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const body = await req.json()
    const { name, description, steps } = body

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 })
    }

    const pipeline = await prisma.employeeTemplateShare.create({
      data: {
        organizationId: orgContext.organizationId,
        name,
        description: description || null,
        category: "pipeline",
        templateData: { steps: steps || [], status: "draft" } as object,
        createdBy: session.user.id,
      },
    })

    return NextResponse.json({
      id: pipeline.id,
      organizationId: pipeline.organizationId,
      name: pipeline.name,
      description: pipeline.description,
      steps: steps || [],
      status: "draft",
      createdBy: pipeline.createdBy,
      createdAt: pipeline.createdAt.toISOString(),
      updatedAt: pipeline.updatedAt.toISOString(),
    }, { status: 201 })
  } catch (error) {
    console.error("Failed to create pipeline:", error)
    return NextResponse.json({ error: "Failed to create pipeline" }, { status: 500 })
  }
}
