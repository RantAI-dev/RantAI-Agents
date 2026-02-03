import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/user/preferences - Get user preferences
export async function GET() {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const preferences = await prisma.userPreference.findUnique({
      where: { userId: session.user.id },
    })

    // Return preferences or defaults
    return NextResponse.json(
      preferences || {
        userId: session.user.id,
        defaultAssistantId: null,
      }
    )
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

    const body = await request.json()
    const { defaultAssistantId } = body

    // If defaultAssistantId provided, verify it exists
    if (defaultAssistantId) {
      const assistant = await prisma.assistant.findUnique({
        where: { id: defaultAssistantId },
      })
      if (!assistant) {
        return NextResponse.json(
          { error: "Assistant not found" },
          { status: 404 }
        )
      }
    }

    const preferences = await prisma.userPreference.upsert({
      where: { userId: session.user.id },
      update: {
        defaultAssistantId: defaultAssistantId || null,
      },
      create: {
        userId: session.user.id,
        defaultAssistantId: defaultAssistantId || null,
      },
    })

    return NextResponse.json(preferences)
  } catch (error) {
    console.error("Failed to update user preferences:", error)
    return NextResponse.json(
      { error: "Failed to update preferences" },
      { status: 500 }
    )
  }
}
