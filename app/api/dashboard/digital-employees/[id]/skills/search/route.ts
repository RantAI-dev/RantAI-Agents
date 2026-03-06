import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"
import { searchClawHub, listClawHubSkills } from "@/lib/digital-employee/clawhub"

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

    const url = new URL(req.url)
    const query = url.searchParams.get("q") || ""

    // No query → return top-rated skills
    const results = query.trim()
      ? await searchClawHub(query)
      : await listClawHubSkills()
    return NextResponse.json({ results })
  } catch (error) {
    console.error("ClawHub search failed:", error)
    return NextResponse.json({ error: "Search failed" }, { status: 500 })
  }
}
