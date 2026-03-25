import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  ToolIdSchema,
  UpdateToolSchema,
} from "@/src/features/tools/schema"
import {
  deleteDashboardTool,
  getDashboardToolById,
  updateDashboardTool,
} from "@/src/features/tools/service"
import { isHttpServiceError } from "@/src/features/shared/http-service-error"

// GET /api/dashboard/tools/[id]
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const idParsed = ToolIdSchema.safeParse(await params)
    if (!idParsed.success) {
      return NextResponse.json({ error: "Invalid tool id" }, { status: 400 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const tool = await getDashboardToolById({
      id: idParsed.data.id,
      organizationId: orgContext?.organizationId ?? null,
    })
    if (isHttpServiceError(tool)) {
      return NextResponse.json({ error: tool.error }, { status: tool.status })
    }

    return NextResponse.json(tool)
  } catch (error) {
    console.error("[Tools API] GET [id] error:", error)
    return NextResponse.json(
      { error: "Failed to fetch tool" },
      { status: 500 }
    )
  }
}

// PUT /api/dashboard/tools/[id]
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const idParsed = ToolIdSchema.safeParse(await params)
    if (!idParsed.success) {
      return NextResponse.json({ error: "Invalid tool id" }, { status: 400 })
    }

    const bodyParsed = UpdateToolSchema.safeParse(await req.json())
    if (!bodyParsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: bodyParsed.error.flatten() },
        { status: 400 }
      )
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const tool = await updateDashboardTool({
      id: idParsed.data.id,
      organizationId: orgContext?.organizationId ?? null,
      input: bodyParsed.data,
    })
    if (isHttpServiceError(tool)) {
      return NextResponse.json({ error: tool.error }, { status: tool.status })
    }

    return NextResponse.json(tool)
  } catch (error) {
    console.error("[Tools API] PUT error:", error)
    return NextResponse.json(
      { error: "Failed to update tool" },
      { status: 500 }
    )
  }
}

// DELETE /api/dashboard/tools/[id]
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const idParsed = ToolIdSchema.safeParse(await params)
    if (!idParsed.success) {
      return NextResponse.json({ error: "Invalid tool id" }, { status: 400 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const result = await deleteDashboardTool({
      id: idParsed.data.id,
      organizationId: orgContext?.organizationId ?? null,
    })
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Tools API] DELETE error:", error)
    return NextResponse.json(
      { error: "Failed to delete tool" },
      { status: 500 }
    )
  }
}
