import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  DigitalEmployeeToolParamsSchema,
  CustomToolUpdateBodySchema,
} from "@/src/features/digital-employees/custom-tools/schema"
import {
  deleteCustomToolForEmployee,
  getCustomToolForEmployee,
  updateCustomToolForEmployee,
} from "@/src/features/digital-employees/custom-tools/service"
import { isHttpServiceError } from "@/src/features/shared/http-service-error"

export async function GET(req: Request, { params }: { params: Promise<{ id: string; toolId: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = DigitalEmployeeToolParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid employee id" }, { status: 400 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const result = await getCustomToolForEmployee({
      employeeId: parsedParams.data.id,
      toolId: parsedParams.data.toolId,
      context: {
        organizationId: orgContext?.organizationId ?? null,
      },
    })

    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to fetch custom tool:", error)
    return NextResponse.json({ error: "Failed to fetch custom tool" }, { status: 500 })
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string; toolId: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = DigitalEmployeeToolParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid employee id" }, { status: 400 })
    }

    const body = CustomToolUpdateBodySchema.safeParse(await req.json())
    if (!body.success) {
      return NextResponse.json({ error: "Failed to update custom tool" }, { status: 400 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const result = await updateCustomToolForEmployee({
      employeeId: parsedParams.data.id,
      toolId: parsedParams.data.toolId,
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
    console.error("Failed to update custom tool:", error)
    return NextResponse.json({ error: "Failed to update custom tool" }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; toolId: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = DigitalEmployeeToolParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid employee id" }, { status: 400 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const result = await deleteCustomToolForEmployee({
      employeeId: parsedParams.data.id,
      toolId: parsedParams.data.toolId,
      context: {
        organizationId: orgContext?.organizationId ?? null,
      },
    })

    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to delete custom tool:", error)
    return NextResponse.json({ error: "Failed to delete custom tool" }, { status: 500 })
  }
}
