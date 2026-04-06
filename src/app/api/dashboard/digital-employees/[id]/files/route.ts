import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  DigitalEmployeeIdParamsSchema,
  EmployeeFilesSyncBodySchema,
} from "@/features/digital-employees/files/schema"
import {
  listEmployeeFiles,
  syncEmployeeFilesForEmployee,
} from "@/features/digital-employees/files/service"
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

    const orgContext = await getOrganizationContext(req, session.user.id)
    const result = await listEmployeeFiles({
      employeeId: parsedParams.data.id,
      context: {
        organizationId: orgContext?.organizationId ?? null,
      },
    })

    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to fetch files:", error)
    return NextResponse.json({ error: "Failed to fetch files" }, { status: 500 })
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = DigitalEmployeeIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid employee id" }, { status: 400 })
    }

    const body = EmployeeFilesSyncBodySchema.safeParse(await req.json())
    if (!body.success) {
      return NextResponse.json({ error: "files array required" }, { status: 400 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const result = await syncEmployeeFilesForEmployee({
      employeeId: parsedParams.data.id,
      updatedBy: session.user.id,
      input: body.data,
      context: {
        organizationId: orgContext?.organizationId ?? null,
      },
    })

    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to sync files:", error)
    return NextResponse.json({ error: "Failed to sync files" }, { status: 500 })
  }
}
