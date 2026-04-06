import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  DashboardDigitalEmployeeIdParamsSchema,
  DashboardDigitalEmployeeUpdateBodySchema,
} from "@/features/digital-employees/employees/schema"
import {
  deleteDashboardDigitalEmployee,
  getDashboardDigitalEmployee,
  isServiceError,
  updateDashboardDigitalEmployee,
} from "@/features/digital-employees/employees/service"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = DashboardDigitalEmployeeIdParamsSchema.parse(await params)
    const orgContext = await getOrganizationContext(req, session.user.id)
    const result = await getDashboardDigitalEmployee({
      id,
      organizationId: orgContext?.organizationId ?? null,
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to fetch digital employee:", error)
    return NextResponse.json({ error: "Failed to fetch digital employee" }, { status: 500 })
  }
}

export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = DashboardDigitalEmployeeIdParamsSchema.parse(await params)
    const orgContext = await getOrganizationContext(req, session.user.id)
    const parsed = DashboardDigitalEmployeeUpdateBodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const result = await updateDashboardDigitalEmployee({
      id,
      context: {
        organizationId: orgContext?.organizationId ?? null,
        role: orgContext?.membership.role ?? null,
        userId: session.user.id,
      },
      input: parsed.data,
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to update digital employee:", error)
    return NextResponse.json({ error: "Failed to update digital employee" }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = DashboardDigitalEmployeeIdParamsSchema.parse(await params)
    const orgContext = await getOrganizationContext(req, session.user.id)
    const result = await deleteDashboardDigitalEmployee({
      id,
      context: {
        organizationId: orgContext?.organizationId ?? null,
        role: orgContext?.membership.role ?? null,
        userId: session.user.id,
      },
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to delete digital employee:", error)
    return NextResponse.json({ error: "Failed to delete digital employee" }, { status: 500 })
  }
}
