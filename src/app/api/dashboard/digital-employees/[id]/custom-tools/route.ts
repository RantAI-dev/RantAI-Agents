import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  CustomToolCreateBodySchema,
  DigitalEmployeeIdParamsSchema,
} from "@/features/digital-employees/custom-tools/schema"
import {
  createCustomToolForEmployee,
  listCustomToolsForEmployee,
} from "@/features/digital-employees/custom-tools/service"
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
    const result = await listCustomToolsForEmployee({
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
    console.error("Failed to fetch custom tools:", error)
    return NextResponse.json({ error: "Failed to fetch custom tools" }, { status: 500 })
  }
}

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

    const body = CustomToolCreateBodySchema.safeParse(await req.json())
    if (!body.success) {
      return NextResponse.json({ error: "Name and code are required" }, { status: 400 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const result = await createCustomToolForEmployee({
      employeeId: parsedParams.data.id,
      createdBy: session.user.id,
      input: body.data,
      context: {
        organizationId: orgContext?.organizationId ?? null,
      },
    })

    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error("Failed to create custom tool:", error)
    return NextResponse.json({ error: "Failed to create custom tool" }, { status: 500 })
  }
}
