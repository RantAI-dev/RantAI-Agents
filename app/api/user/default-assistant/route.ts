import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/user/default-assistant - Get effective default assistant for current user
// Priority: User preference > System default > First built-in
export async function GET() {
  try {
    const session = await auth()

    // Check user preference first (if authenticated)
    if (session?.user?.id) {
      const preferences = await prisma.userPreference.findUnique({
        where: { userId: session.user.id },
      })

      if (preferences?.defaultAssistantId) {
        const userDefault = await prisma.assistant.findUnique({
          where: { id: preferences.defaultAssistantId },
        })
        if (userDefault) {
          return NextResponse.json({
            assistant: userDefault,
            source: "user",
          })
        }
      }
    }

    // Check system default
    const systemDefault = await prisma.assistant.findFirst({
      where: { isSystemDefault: true },
    })

    if (systemDefault) {
      return NextResponse.json({
        assistant: systemDefault,
        source: "system",
      })
    }

    // Fallback to first built-in assistant
    const fallback = await prisma.assistant.findFirst({
      where: { isBuiltIn: true },
      orderBy: { createdAt: "asc" },
    })

    if (fallback) {
      return NextResponse.json({
        assistant: fallback,
        source: "fallback",
      })
    }

    // No assistants at all - this shouldn't happen
    return NextResponse.json({ assistant: null, source: "none" })
  } catch (error) {
    console.error("Failed to fetch default assistant:", error)
    return NextResponse.json(
      { error: "Failed to fetch default assistant" },
      { status: 500 }
    )
  }
}
