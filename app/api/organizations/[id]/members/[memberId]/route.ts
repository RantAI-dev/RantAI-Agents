import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  OrganizationMemberParamsSchema,
  UpdateMemberRoleSchema,
} from "@/src/features/organizations/members/schema"
import {
  changeOrganizationMemberRole,
  removeOrganizationMember,
} from "@/src/features/organizations/members/service"
import { isHttpServiceError } from "@/src/features/shared/http-service-error"

// PATCH /api/organizations/[id]/members/[memberId] - Update member role
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = OrganizationMemberParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid route params" }, { status: 400 })
    }

    const parsedBody = UpdateMemberRoleSchema.safeParse(await req.json())
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsedBody.error.flatten() },
        { status: 400 }
      )
    }

    const member = await changeOrganizationMemberRole({
      actorUserId: session.user.id,
      organizationId: parsedParams.data.id,
      memberId: parsedParams.data.memberId,
      input: parsedBody.data,
    })
    if (isHttpServiceError(member)) {
      return NextResponse.json({ error: member.error }, { status: member.status })
    }

    return NextResponse.json({
      id: member.id,
      userId: member.userId,
      email: member.email,
      name: member.name,
      role: member.role,
      invitedAt: member.invitedAt,
      acceptedAt: member.acceptedAt,
    })
  } catch (error) {
    console.error("[Member API] PATCH error:", error)
    return NextResponse.json(
      { error: "Failed to update member" },
      { status: 500 }
    )
  }
}

// DELETE /api/organizations/[id]/members/[memberId] - Remove member
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = OrganizationMemberParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid route params" }, { status: 400 })
    }

    const result = await removeOrganizationMember({
      actorUserId: session.user.id,
      organizationId: parsedParams.data.id,
      memberId: parsedParams.data.memberId,
    })
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Member API] DELETE error:", error)
    return NextResponse.json(
      { error: "Failed to remove member" },
      { status: 500 }
    )
  }
}
