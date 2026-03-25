import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  InviteMemberSchema,
  OrganizationIdParamsSchema,
} from "@/src/features/organizations/members/schema"
import {
  inviteOrganizationMember,
  listOrganizationMembers,
} from "@/src/features/organizations/members/service"
import { isHttpServiceError } from "@/src/features/shared/http-service-error"

// GET /api/organizations/[id]/members - List all members
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = OrganizationIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid organization id" }, { status: 400 })
    }

    const members = await listOrganizationMembers({
      actorUserId: session.user.id,
      organizationId: parsedParams.data.id,
    })
    if (isHttpServiceError(members)) {
      return NextResponse.json({ error: members.error }, { status: members.status })
    }

    return NextResponse.json(members)
  } catch (error) {
    console.error("[Members API] GET error:", error)
    return NextResponse.json(
      { error: "Failed to fetch members" },
      { status: 500 }
    )
  }
}

// POST /api/organizations/[id]/members - Invite a new member
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = OrganizationIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid organization id" }, { status: 400 })
    }

    const parsedBody = InviteMemberSchema.safeParse(await req.json())
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsedBody.error.flatten() },
        { status: 400 }
      )
    }

    const member = await inviteOrganizationMember({
      actorUserId: session.user.id,
      organizationId: parsedParams.data.id,
      input: parsedBody.data,
    })
    if (isHttpServiceError(member)) {
      return NextResponse.json({ error: member.error }, { status: member.status })
    }

    return NextResponse.json(member)
  } catch (error) {
    console.error("[Members API] POST error:", error)
    return NextResponse.json(
      { error: "Failed to invite member" },
      { status: 500 }
    )
  }
}
