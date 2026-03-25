import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  CreateCredentialSchema,
} from "@/src/features/credentials/schema"
import {
  createDashboardCredential,
  listDashboardCredentials,
} from "@/src/features/credentials/service"

// GET /api/dashboard/credentials — List credentials (no secret data)
export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    return NextResponse.json(
      await listDashboardCredentials({
        organizationId: orgContext?.organizationId ?? null,
        userId: session.user.id,
      })
    )
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
    const parsed = CreateCredentialSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const result = await createDashboardCredential({
      context: {
        organizationId: orgContext?.organizationId ?? null,
        userId: session.user.id,
      },
      input: parsed.data,
    })
    if ("status" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error("[Credentials API] POST error:", error)
    return NextResponse.json(
      { error: "Failed to create credential" },
      { status: 500 }
    )
  }
}
