import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  DigitalEmployeeIdParamsSchema,
  WorkspaceFilePathQuerySchema,
} from "@/features/digital-employees/workspace/schema"
import { readWorkspaceFile } from "@/features/digital-employees/workspace/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = DigitalEmployeeIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid employee id" }, { status: 400 })
    }

    const url = new URL(req.url)
    const query = WorkspaceFilePathQuerySchema.safeParse(Object.fromEntries(url.searchParams.entries()))
    if (!query.success) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const result = await readWorkspaceFile({
      employeeId: parsedParams.data.id,
      context: {
        organizationId: orgContext?.organizationId ?? null,
      },
      path: typeof query.data.path === "string" ? query.data.path : null,
    })

    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result.data, { status: result.status })
  } catch (error) {
    console.error("Workspace file read error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
