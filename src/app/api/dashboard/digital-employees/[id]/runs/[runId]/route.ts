import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  DigitalEmployeeRunIdParamsSchema,
} from "@/features/digital-employees/runs/schema"
import {
  getDigitalEmployeeRun,
} from "@/features/digital-employees/runs/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"

interface RouteParams {
  params: Promise<{ id: string; runId: string }>
}

export async function GET(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = DigitalEmployeeRunIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid employee id" }, { status: 400 })
    }
    const orgContext = await getOrganizationContext(req, session.user.id)
    const run = await getDigitalEmployeeRun({
      digitalEmployeeId: parsedParams.data.id,
      organizationId: orgContext?.organizationId ?? null,
      runId: parsedParams.data.runId,
    })
    if (isHttpServiceError(run)) {
      return NextResponse.json({ error: run.error }, { status: run.status })
    }

    return NextResponse.json(run)
  } catch (error) {
    console.error("Failed to fetch run:", error)
    return NextResponse.json({ error: "Failed to fetch run" }, { status: 500 })
  }
}
