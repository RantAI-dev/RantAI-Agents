import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getDashboardFeatures } from "@/features/platform-features/service"

// GET feature flags for dashboard consumption
export async function GET() {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    return NextResponse.json(await getDashboardFeatures())
  } catch (error) {
    console.error("Error fetching features:", error)
    return NextResponse.json(
      { error: "Failed to fetch features" },
      { status: 500 }
    )
  }
}
