import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  UpdateCredentialSchema,
} from "@/src/features/credentials/schema"
import {
  deleteDashboardCredentialRecord,
  getDashboardCredential,
  updateDashboardCredentialRecord,
} from "@/src/features/credentials/service"

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/dashboard/credentials/[id] — Get a single credential (no secret data)
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)

    const result = await getDashboardCredential({
      context: {
        organizationId: orgContext?.organizationId ?? null,
        userId: session.user.id,
      },
      id,
    })
    if ("status" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Credentials API] GET [id] error:", error)
    return NextResponse.json(
      { error: "Failed to fetch credential" },
      { status: 500 }
    )
  }
}

// PUT /api/dashboard/credentials/[id] — Update a credential
export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)

    const parsed = UpdateCredentialSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const result = await updateDashboardCredentialRecord({
      context: {
        organizationId: orgContext?.organizationId ?? null,
        userId: session.user.id,
      },
      id,
      input: parsed.data,
    })
    if ("status" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Credentials API] PUT error:", error)
    return NextResponse.json(
      { error: "Failed to update credential" },
      { status: 500 }
    )
  }
}

// DELETE /api/dashboard/credentials/[id] — Delete a credential
export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)

    const result = await deleteDashboardCredentialRecord({
      context: {
        organizationId: orgContext?.organizationId ?? null,
        userId: session.user.id,
      },
      id,
    })
    if ("status" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Credentials API] DELETE error:", error)
    return NextResponse.json(
      { error: "Failed to delete credential" },
      { status: 500 }
    )
  }
}
