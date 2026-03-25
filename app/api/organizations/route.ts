import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { CreateOrganizationSchema } from "@/src/features/organizations/core/schema"
import {
  createOrganizationForUser,
  listOrganizationsForUser,
} from "@/src/features/organizations/core/service"
import { isHttpServiceError } from "@/src/features/shared/http-service-error"

// GET /api/organizations - List all organizations for the current user
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizations = await listOrganizationsForUser(session.user.id)
    return NextResponse.json(organizations)
  } catch (error) {
    console.error("[Organizations API] GET error:", error)
    return NextResponse.json(
      { error: "Failed to fetch organizations" },
      { status: 500 }
    )
  }
}

// POST /api/organizations - Create a new organization
export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id || !session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsed = CreateOrganizationSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const organization = await createOrganizationForUser({
      input: parsed.data,
      userId: session.user.id,
      userEmail: session.user.email,
      userName: session.user.name ?? undefined,
    })
    if (isHttpServiceError(organization)) {
      return NextResponse.json({ error: organization.error }, { status: organization.status })
    }

    return NextResponse.json(organization)
  } catch (error) {
    console.error("[Organizations API] POST error:", error)
    return NextResponse.json(
      { error: "Failed to create organization" },
      { status: 500 }
    )
  }
}
