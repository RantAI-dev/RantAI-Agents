import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  DigitalEmployeeFileParamsSchema,
  EmployeeFileUpdateBodySchema,
} from "@/src/features/digital-employees/files/schema"
import {
  getEmployeeFile,
  updateEmployeeFile,
} from "@/src/features/digital-employees/files/service"
import { isHttpServiceError } from "@/src/features/shared/http-service-error"

export async function GET(req: Request, { params }: { params: Promise<{ id: string; filename: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = DigitalEmployeeFileParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid employee id" }, { status: 400 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const result = await getEmployeeFile({
      employeeId: parsedParams.data.id,
      filename: decodeURIComponent(parsedParams.data.filename),
      context: {
        organizationId: orgContext?.organizationId ?? null,
      },
    })

    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to fetch file:", error)
    return NextResponse.json({ error: "Failed to fetch file" }, { status: 500 })
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string; filename: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = DigitalEmployeeFileParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid employee id" }, { status: 400 })
    }

    const body = EmployeeFileUpdateBodySchema.safeParse(await req.json())
    if (!body.success) {
      return NextResponse.json({ error: "Failed to update file" }, { status: 400 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const result = await updateEmployeeFile({
      employeeId: parsedParams.data.id,
      filename: decodeURIComponent(parsedParams.data.filename),
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
    console.error("Failed to update file:", error)
    return NextResponse.json({ error: "Failed to update file" }, { status: 500 })
  }
}
