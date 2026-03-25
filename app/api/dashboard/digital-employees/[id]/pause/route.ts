import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import { DigitalEmployeeIdParamsSchema } from "@/src/features/digital-employees/lifecycle/schema"
import { pauseDigitalEmployee } from "@/src/features/digital-employees/lifecycle/service"
import { isHttpServiceError } from "@/src/features/shared/http-service-error"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = DigitalEmployeeIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid employee id" }, { status: 400 })
    }
    const orgContext = await getOrganizationContext(req, session.user.id)
    const result = await pauseDigitalEmployee({
      digitalEmployeeId: parsedParams.data.id,
      organizationId: orgContext?.organizationId ?? null,
    })
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Pause failed:", error)
    return NextResponse.json({ error: "Pause failed" }, { status: 500 })
  }
}
