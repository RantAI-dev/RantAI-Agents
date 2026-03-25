import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  DashboardDigitalEmployeeTriggerUpdateSchema,
} from "@/src/features/digital-employees/interactions/schema"
import {
  deleteDigitalEmployeeTrigger,
  isServiceError,
  updateDigitalEmployeeTrigger,
} from "@/src/features/digital-employees/interactions/service"

interface RouteParams {
  params: Promise<{ id: string; triggerId: string }>
}

export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id, triggerId } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)
    const parsed = DashboardDigitalEmployeeTriggerUpdateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const result = await updateDigitalEmployeeTrigger({
      id,
      organizationId: orgContext?.organizationId ?? null,
      triggerId,
      input: parsed.data,
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to update trigger:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id, triggerId } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)
    const result = await deleteDigitalEmployeeTrigger({
      id,
      organizationId: orgContext?.organizationId ?? null,
      triggerId,
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to delete trigger:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
