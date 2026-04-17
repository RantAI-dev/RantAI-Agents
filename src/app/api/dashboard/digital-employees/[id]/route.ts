import { NextResponse } from "next/server"
import { getUserId } from "@/lib/get-user-id"
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
    const userId = await getUserId(req)
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = DashboardDigitalEmployeeIdParamsSchema.parse(await params)
    const orgContext = await getOrganizationContext(req, userId)
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
    const userId = await getUserId(req)
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = DashboardDigitalEmployeeIdParamsSchema.parse(await params)
    const orgContext = await getOrganizationContext(req, userId)
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
        userId: userId,
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
    const userId = await getUserId(req)
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = DashboardDigitalEmployeeIdParamsSchema.parse(await params)
    const orgContext = await getOrganizationContext(req, userId)
    const result = await deleteDashboardDigitalEmployee({
      id,
      context: {
        organizationId: orgContext?.organizationId ?? null,
        role: orgContext?.membership.role ?? null,
        userId: userId,
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
