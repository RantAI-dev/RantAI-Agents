import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import {
  createDashboardTemplateForDashboard,
  listDashboardTemplates,
  type ServiceError,
} from "@/features/templates/service"
import { DashboardTemplateCreateBodySchema } from "@/features/templates/schema"

function isServiceError(value: unknown): value is ServiceError {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as { status?: unknown; error?: unknown }
  return typeof candidate.status === "number" && typeof candidate.error === "string"
}

// GET /api/dashboard/templates — list org + public shared templates
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

    const templates = await listDashboardTemplates(orgContext.organizationId)

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

    const orgContext = await getOrganizationContextWithFallback(req, session.user.id)
    if (!orgContext) {
      return NextResponse.json({ error: "Organization required" }, { status: 400 })
    }

    const parsed = DashboardTemplateCreateBodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: "name, category, and templateData are required" },
        { status: 400 }
      )
    }

    const template = await createDashboardTemplateForDashboard({
      context: {
        organizationId: orgContext.organizationId,
        role: orgContext.membership.role,
        userId: session.user.id,
      },
      input: parsed.data,
    })
    if (isServiceError(template)) {
      return NextResponse.json({ error: template.error }, { status: template.status })
    }

    return NextResponse.json(template, { status: 201 })
  } catch (error) {
    console.error("Failed to create template:", error)
    return NextResponse.json({ error: "Failed to create template" }, { status: 500 })
  }
}
