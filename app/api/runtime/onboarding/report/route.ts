import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyRuntimeToken } from "@/lib/digital-employee/runtime-auth"

export async function POST(req: Request) {
  try {
    const bearerToken = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!bearerToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await verifyRuntimeToken(bearerToken)

    const { employeeId, step, status, details } = await req.json()
    if (!employeeId || !step || !status) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Read existing onboarding status
    const existing = await prisma.employeeFile.findUnique({
      where: { digitalEmployeeId_filename: { digitalEmployeeId: employeeId, filename: "ONBOARDING_STATUS.json" } },
    })

    const current = existing ? JSON.parse(existing.content) : { steps: {}, startedAt: new Date().toISOString() }
    current.steps[step] = { status, details: details || null, updatedAt: new Date().toISOString() }

    // Count completed
    const stepValues = Object.values(current.steps) as Array<{ status: string }>
    current.completedCount = stepValues.filter((s) => s.status === "completed").length
    current.totalSteps = stepValues.length

    await prisma.employeeFile.upsert({
      where: { digitalEmployeeId_filename: { digitalEmployeeId: employeeId, filename: "ONBOARDING_STATUS.json" } },
      create: { digitalEmployeeId: employeeId, filename: "ONBOARDING_STATUS.json", content: JSON.stringify(current, null, 2) },
      update: { content: JSON.stringify(current, null, 2) },
    })

    return NextResponse.json(current)
  } catch (error) {
    console.error("Onboarding report failed:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
