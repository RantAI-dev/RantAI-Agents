import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"
import { encryptCredential } from "@/lib/workflow/credentials"

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/dashboard/credentials/[id] — Get a single credential (no secret data)
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    const credential = await prisma.credential.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        type: true,
        organizationId: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!credential) {
      return NextResponse.json(
        { error: "Credential not found" },
        { status: 404 }
      )
    }

    // Verify org ownership
    const orgContext = await getOrganizationContext(req, session.user.id)
    if (credential.organizationId && credential.organizationId !== orgContext?.organizationId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    return NextResponse.json(credential)
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
    const body = await req.json()
    const { name, type, data } = body

    const existing = await prisma.credential.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { error: "Credential not found" },
        { status: 404 }
      )
    }

    // Verify ownership
    const orgContext = await getOrganizationContext(req, session.user.id)
    if (
      existing.organizationId &&
      existing.organizationId !== orgContext?.organizationId
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const updateData: Record<string, unknown> = {}
    if (name) updateData.name = name
    if (type) {
      const validTypes = ["api_key", "oauth2", "basic_auth", "bearer"]
      if (!validTypes.includes(type)) {
        return NextResponse.json(
          { error: `Invalid type. Must be one of: ${validTypes.join(", ")}` },
          { status: 400 }
        )
      }
      updateData.type = type
    }
    if (data) {
      updateData.encryptedData = encryptCredential(data)
    }

    const credential = await prisma.credential.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        type: true,
        organizationId: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json(credential)
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

    const existing = await prisma.credential.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { error: "Credential not found" },
        { status: 404 }
      )
    }

    // Verify ownership
    const orgContext = await getOrganizationContext(req, session.user.id)
    if (
      existing.organizationId &&
      existing.organizationId !== orgContext?.organizationId
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await prisma.credential.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Credentials API] DELETE error:", error)
    return NextResponse.json(
      { error: "Failed to delete credential" },
      { status: 500 }
    )
  }
}
