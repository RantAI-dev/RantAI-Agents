import { NextResponse } from "next/server"
import { getUserId } from "@/lib/get-user-id"
import { CreateOrganizationSchema } from "@/features/organizations/core/schema"
import {
  createOrganizationForUser,
  listOrganizationsForUser,
} from "@/features/organizations/core/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"

// GET /api/organizations - List all organizations for the current user
export async function GET(req: Request) {
  try {
    const userId = await getUserId(req)
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizations = await listOrganizationsForUser(userId)
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
    const userId = await getUserId(req)
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
      userId: userId,
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
