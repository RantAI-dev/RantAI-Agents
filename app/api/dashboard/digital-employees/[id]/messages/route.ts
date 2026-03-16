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

    // Verify employee belongs to org
    const employee = await prisma.digitalEmployee.findFirst({
      where: {
        id,
        ...(orgContext ? { organizationId: orgContext.organizationId } : {}),
      },
      select: { id: true },
    })

    if (!employee) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const { searchParams } = new URL(req.url)
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100)
    const before = searchParams.get("before")

    const messages = await prisma.employeeMessage.findMany({
      where: {
        OR: [
          { fromEmployeeId: id },
          { toEmployeeId: id },
        ],
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      include: {
        fromEmployee: { select: { id: true, name: true, avatar: true } },
        toEmployee: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    })

    return NextResponse.json({ messages })
  } catch (error) {
    console.error("Failed to fetch messages:", error)
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 })
  }
}
