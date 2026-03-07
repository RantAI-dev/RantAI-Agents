import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)

    const employee = await prisma.digitalEmployee.findFirst({
      where: { id, ...(orgContext ? { organizationId: orgContext.organizationId } : {}) },
    })
    if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const updates: Record<string, unknown> = { sandboxMode: false }

    // Optionally promote L1 → L2 on go-live
    if (employee.autonomyLevel === "L1") {
      updates.autonomyLevel = "L2"
      updates.trustScore = Math.max(employee.trustScore, 50)
    }

    const updated = await prisma.digitalEmployee.update({
      where: { id },
      data: updates,
    })

    return NextResponse.json({
      success: true,
      sandboxMode: updated.sandboxMode,
      autonomyLevel: updated.autonomyLevel,
    })
  } catch (error) {
    console.error("Go-live failed:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
