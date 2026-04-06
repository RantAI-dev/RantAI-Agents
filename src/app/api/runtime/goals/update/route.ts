import { NextResponse } from "next/server"
import { verifyRuntimeToken } from "@/lib/digital-employee/runtime-auth"
import { RuntimeGoalUpdateSchema } from "@/features/runtime/goals/schema"
import { updateRuntimeGoal } from "@/features/runtime/goals/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"

export async function POST(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { employeeId } = await verifyRuntimeToken(token)
    const parsedBody = RuntimeGoalUpdateSchema.safeParse(await req.json())
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid request payload", details: parsedBody.error.flatten() }, { status: 400 })
    }

    const result = await updateRuntimeGoal({
      employeeId,
      goalId: parsedBody.data.goalId,
      increment: parsedBody.data.increment,
      setValue: parsedBody.data.setValue,
    })
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to update goal:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
