import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET all feature configurations
export async function GET() {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const features = await prisma.featureConfig.findMany({
      orderBy: { feature: "asc" },
    })

    // Ensure all features exist in the response
    const allFeatures = ["AGENT"]
    const result = allFeatures.map((feature) => {
      const existing = features.find((f) => f.feature === feature)
      if (existing) {
        return existing
      }
      // Return default config for missing features (enabled by default)
      return {
        id: null,
        feature,
        enabled: true,
        config: {},
        createdAt: null,
        updatedAt: null,
      }
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

// PUT to update a feature configuration
export async function PUT(request: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { feature, enabled, config } = body

    if (!feature) {
      return NextResponse.json(
        { error: "Feature is required" },
        { status: 400 }
      )
    }

    const updated = await prisma.featureConfig.upsert({
      where: { feature },
      create: {
        feature,
        enabled: enabled ?? true,
        config: config ?? {},
      },
      update: {
        enabled: enabled ?? undefined,
        config: config ?? undefined,
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Error updating feature:", error)
    return NextResponse.json(
      { error: "Failed to update feature" },
      { status: 500 }
    )
  }
}
