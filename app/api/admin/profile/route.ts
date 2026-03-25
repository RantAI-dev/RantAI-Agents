import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { UpdateAdminProfileSchema } from "@/src/features/admin/profile/schema"
import {
  getAdminProfile,
  isServiceError,
  updateAdminProfile,
} from "@/src/features/admin/profile/service"

// GET - Get current user profile
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await getAdminProfile(session.user.id)
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to get profile:", error)
    return NextResponse.json(
      { error: "Failed to get profile" },
      { status: 500 }
    )
  }
}

// PUT - Update user profile
export async function PUT(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const parsed = UpdateAdminProfileSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      )
    }

    const agent = await updateAdminProfile(session.user.id, parsed.data)
    return NextResponse.json(agent)
  } catch (error) {
    console.error("Failed to update profile:", error)
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    )
  }
}
