import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  DigitalEmployeeIdParamsSchema,
  WorkspaceExecBodySchema,
} from "@/src/features/digital-employees/workspace/schema"
import { executeWorkspaceCommand } from "@/src/features/digital-employees/workspace/service"
import { isHttpServiceError } from "@/src/features/shared/http-service-error"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = DigitalEmployeeIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid employee id" }, { status: 400 })
    }

    const body = WorkspaceExecBodySchema.safeParse(await req.json())
    if (!body.success) {
      return NextResponse.json({ error: "command is required" }, { status: 400 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const result = await executeWorkspaceCommand({
      employeeId: parsedParams.data.id,
      context: {
        organizationId: orgContext?.organizationId ?? null,
      },
      input: body.data,
    })

    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result.data, { status: result.status })
  } catch (error) {
    console.error("Workspace exec error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
