import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { UpdateAdminFeatureSchema } from "@/features/admin/features/schema"
import {
  getAdminFeatures,
  updateAdminFeature,
} from "@/features/admin/features/service"

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
    const features = await getAdminFeatures()
    return NextResponse.json(features)
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
    const parsed = UpdateAdminFeatureSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Feature is required" },
        { status: 400 }
      )
    }

    const updated = await updateAdminFeature(parsed.data)
    return NextResponse.json(updated)
  } catch (error) {
    console.error("Error updating feature:", error)
    return NextResponse.json(
      { error: "Failed to update feature" },
      { status: 500 }
    )
  }
}
