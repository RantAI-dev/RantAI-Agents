import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { UpdateUserPreferencesSchema } from "@/features/user/preferences/schema"
import {
  getUserPreferences,
  updateUserPreferences,
} from "@/features/user/preferences/service"

// GET /api/user/preferences - Get user preferences
export async function GET() {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const preferences = await getUserPreferences(session.user.id)
    return NextResponse.json(preferences)
  } catch (error) {
    console.error("Failed to fetch user preferences:", error)
    return NextResponse.json(
      { error: "Failed to fetch preferences" },
      { status: 500 }
    )
  }
}

// PUT /api/user/preferences - Update user preferences
export async function PUT(request: Request) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsed = UpdateUserPreferencesSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const preferences = await updateUserPreferences(session.user.id, parsed.data)
    if ("error" in preferences) {
      return NextResponse.json({ error: preferences.error }, { status: preferences.status })
    }

    return NextResponse.json(preferences)
  } catch (error) {
    console.error("Failed to update user preferences:", error)
    return NextResponse.json(
      { error: "Failed to update preferences" },
      { status: 500 }
    )
  }
}
