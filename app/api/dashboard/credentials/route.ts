import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"
import { encryptCredential } from "@/lib/workflow/credentials"

// GET /api/dashboard/credentials — List credentials (no secret data)
export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)

    const credentials = await prisma.credential.findMany({
      where: {
        OR: [
          { organizationId: null, createdBy: session.user.id },
          ...(orgContext
            ? [{ organizationId: orgContext.organizationId }]
            : []),
        ],
      },
      select: {
        id: true,
        name: true,
        type: true,
        organizationId: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
        // NOTE: encryptedData is intentionally excluded
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json(credentials)
  } catch (error) {
    console.error("[Credentials API] GET error:", error)
    return NextResponse.json(
      { error: "Failed to fetch credentials" },
      { status: 500 }
    )
  }
}

// POST /api/dashboard/credentials — Create a new credential
export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const body = await req.json()
    const { name, type, data } = body

    if (!name || !type || !data) {
      return NextResponse.json(
        { error: "name, type, and data are required" },
        { status: 400 }
      )
    }

    const validTypes = ["api_key", "oauth2", "basic_auth", "bearer"]
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      )
    }

    const encryptedData = encryptCredential(data)

    const credential = await prisma.credential.create({
      data: {
        name,
        type,
        encryptedData,
        organizationId: orgContext?.organizationId || null,
        createdBy: session.user.id,
      },
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

    return NextResponse.json(credential, { status: 201 })
  } catch (error) {
    console.error("[Credentials API] POST error:", error)
    return NextResponse.json(
      { error: "Failed to create credential" },
      { status: 500 }
    )
  }
}
