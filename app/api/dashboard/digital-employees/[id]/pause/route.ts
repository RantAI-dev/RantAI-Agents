import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"
import { orchestrator } from "@/lib/digital-employee"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)

    const employee = await prisma.digitalEmployee.findFirst({
      where: {
        id,
        ...(orgContext ? { organizationId: orgContext.organizationId } : {}),
      },
      select: { id: true, groupId: true },
    })

    if (!employee) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    await orchestrator.stopGroup(employee.groupId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Pause failed:", error)
    return NextResponse.json({ error: "Pause failed" }, { status: 500 })
  }
}
