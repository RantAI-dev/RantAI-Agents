import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  DigitalEmployeeIdParamsSchema,
  TriggerDigitalEmployeeRunSchema,
} from "@/src/features/digital-employees/runs/schema"
import {
  triggerDigitalEmployeeRun,
} from "@/src/features/digital-employees/runs/service"
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

    const parsedBody = TriggerDigitalEmployeeRunSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid request payload", details: parsedBody.error.flatten() }, { status: 400 })
    }

    const result = await triggerDigitalEmployeeRun({
      digitalEmployeeId: parsedParams.data.id,
      organizationId: orgContext?.organizationId ?? null,
      input: parsedBody.data,
    })
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error("Run failed:", error)
    const message = error instanceof Error ? error.message : "Run failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
