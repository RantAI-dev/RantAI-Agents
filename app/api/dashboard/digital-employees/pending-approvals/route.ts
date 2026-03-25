import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import { listPendingDigitalEmployeeApprovals } from "@/src/features/digital-employees/employees/service"

// GET /api/dashboard/digital-employees/pending-approvals
export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const result = await listPendingDigitalEmployeeApprovals({
      organizationId: orgContext?.organizationId ?? null,
    })
    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to fetch pending approvals:", error)
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 })
  }
}
