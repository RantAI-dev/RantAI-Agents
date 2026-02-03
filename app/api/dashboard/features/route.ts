import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET feature flags for dashboard consumption
export async function GET() {
  const session = await auth()

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const features = await prisma.featureConfig.findMany()

    // Return a simple map of feature -> enabled
    const allFeatures = ["AGENT"]
    const result: Record<string, boolean> = {}

    allFeatures.forEach((feature) => {
      const existing = features.find((f) => f.feature === feature)
      result[feature] = existing ? existing.enabled : true
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error("Error fetching features:", error)
    return NextResponse.json(
      { error: "Failed to fetch features" },
      { status: 500 }
    )
  }
}
