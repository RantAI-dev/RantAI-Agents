import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext, getOrganizationContextWithFallback } from "@/lib/organization"
import {
  createDashboardDigitalEmployee,
  isServiceError,
  listDashboardDigitalEmployees,
} from "@/src/features/digital-employees/employees/service"
import {
  DashboardDigitalEmployeeCreateBodySchema,
} from "@/src/features/digital-employees/employees/schema"
// GET /api/dashboard/digital-employees - List employees
export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const employees = await listDashboardDigitalEmployees({
      organizationId: orgContext?.organizationId ?? null,
    })

    return NextResponse.json(employees)
  } catch (error) {
    console.error("Failed to fetch digital employees:", error)
    return NextResponse.json({ error: "Failed to fetch digital employees" }, { status: 500 })
  }
}

// POST /api/dashboard/digital-employees - Create employee
export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContextWithFallback(req, session.user.id)
    const parsed = DashboardDigitalEmployeeCreateBodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const result = await createDashboardDigitalEmployee({
      context: {
        organizationId: orgContext?.organizationId ?? null,
        role: orgContext?.membership.role ?? null,
        userId: session.user.id,
        userEmail: session.user.email ?? null,
        userName: session.user.name ?? null,
      },
      input: parsed.data,
    })

    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error("Failed to create digital employee:", error)
    return NextResponse.json({ error: "Failed to create digital employee" }, { status: 500 })
  }
}
