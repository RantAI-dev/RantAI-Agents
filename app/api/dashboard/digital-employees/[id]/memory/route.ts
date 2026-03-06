import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(req: Request, { params }: RouteParams) {
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
    })

    if (!employee) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const { searchParams } = new URL(req.url)
    const type = searchParams.get("type")

    const entries = await prisma.employeeMemory.findMany({
      where: {
        digitalEmployeeId: id,
        ...(type ? { type } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    })

    return NextResponse.json(entries)
  } catch (error) {
    console.error("Failed to fetch memory:", error)
    return NextResponse.json({ error: "Failed to fetch memory" }, { status: 500 })
  }
}
