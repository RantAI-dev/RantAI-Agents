import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { resolveDefaultAssistant } from "@/src/features/user/default-assistant/service"

// GET /api/user/default-assistant - Get effective default assistant for current user
// Priority: User preference > System default > First built-in
export async function GET() {
  try {
    const session = await auth()
    const result = await resolveDefaultAssistant(session?.user?.id ?? null)
    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to fetch default assistant:", error)
    return NextResponse.json(
      { error: "Failed to fetch default assistant" },
      { status: 500 }
    )
  }
}
