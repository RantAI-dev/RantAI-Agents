import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyRuntimeToken } from "@/lib/digital-employee/runtime-auth"

export async function POST(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { employeeId } = await verifyRuntimeToken(token)
    const { goalId, increment, setValue } = await req.json()

    if (!goalId) return NextResponse.json({ error: "goalId required" }, { status: 400 })

    const goal = await prisma.employeeGoal.findFirst({
      where: { id: goalId, digitalEmployeeId: employeeId },
    })
    if (!goal) return NextResponse.json({ error: "Goal not found" }, { status: 404 })

    const newValue = setValue !== undefined
      ? Number(setValue)
      : goal.currentValue + (increment !== undefined ? Number(increment) : 1)

    const updated = await prisma.employeeGoal.update({
      where: { id: goalId },
      data: { currentValue: newValue },
    })

    return NextResponse.json({ id: updated.id, currentValue: updated.currentValue, target: updated.target })
  } catch (error) {
    console.error("Failed to update goal:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
