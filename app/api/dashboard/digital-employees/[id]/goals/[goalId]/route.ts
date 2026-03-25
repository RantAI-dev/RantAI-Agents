import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  DigitalEmployeeGoalIdParamsSchema,
  UpdateDigitalEmployeeGoalSchema,
} from "@/src/features/digital-employees/goals/schema"
import {
  deleteDigitalEmployeeGoalForEmployee,
  updateDigitalEmployeeGoalForEmployee,
} from "@/src/features/digital-employees/goals/service"
import { isHttpServiceError } from "@/src/features/shared/http-service-error"

interface RouteParams {
  params: Promise<{ id: string; goalId: string }>
}

export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const parsedParams = DigitalEmployeeGoalIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid employee id" }, { status: 400 })
    }
    const orgContext = await getOrganizationContext(req, session.user.id)
    const parsedBody = UpdateDigitalEmployeeGoalSchema.safeParse(await req.json())
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid request payload", details: parsedBody.error.flatten() }, { status: 400 })
    }

    const goal = await updateDigitalEmployeeGoalForEmployee({
      digitalEmployeeId: parsedParams.data.id,
      organizationId: orgContext?.organizationId ?? null,
      goalId: parsedParams.data.goalId,
      input: parsedBody.data,
    })
    if (isHttpServiceError(goal)) {
      return NextResponse.json({ error: goal.error }, { status: goal.status })
    }

    return NextResponse.json(goal)
  } catch (error) {
    console.error("Failed to update goal:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const parsedParams = DigitalEmployeeGoalIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid employee id" }, { status: 400 })
    }
    const orgContext = await getOrganizationContext(req, session.user.id)
    const result = await deleteDigitalEmployeeGoalForEmployee({
      digitalEmployeeId: parsedParams.data.id,
      organizationId: orgContext?.organizationId ?? null,
      goalId: parsedParams.data.goalId,
    })
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to delete goal:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
