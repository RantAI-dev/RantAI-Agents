import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  CreateDigitalEmployeeGoalSchema,
  DigitalEmployeeIdParamsSchema,
} from "@/src/features/digital-employees/goals/schema"
import {
  createDigitalEmployeeGoalForEmployee,
  listDigitalEmployeeGoals,
} from "@/src/features/digital-employees/goals/service"
import { isHttpServiceError } from "@/src/features/shared/http-service-error"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const parsedParams = DigitalEmployeeIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid employee id" }, { status: 400 })
    }
    const orgContext = await getOrganizationContext(req, session.user.id)
    const goals = await listDigitalEmployeeGoals({
      digitalEmployeeId: parsedParams.data.id,
      organizationId: orgContext?.organizationId ?? null,
    })
    if (isHttpServiceError(goals)) {
      return NextResponse.json({ error: goals.error }, { status: goals.status })
    }

    return NextResponse.json(goals)
  } catch (error) {
    console.error("Failed to fetch goals:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const parsedParams = DigitalEmployeeIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid employee id" }, { status: 400 })
    }
    const orgContext = await getOrganizationContext(req, session.user.id)
    const parsedBody = CreateDigitalEmployeeGoalSchema.safeParse(await req.json())
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid request payload", details: parsedBody.error.flatten() }, { status: 400 })
    }

    const goal = await createDigitalEmployeeGoalForEmployee({
      digitalEmployeeId: parsedParams.data.id,
      organizationId: orgContext?.organizationId ?? null,
      input: parsedBody.data,
    })
    if (isHttpServiceError(goal)) {
      return NextResponse.json({ error: goal.error }, { status: goal.status })
    }

    return NextResponse.json(goal, { status: 201 })
  } catch (error) {
    console.error("Failed to create goal:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
