import { NextResponse } from "next/server"

import { UpdateAdminFeatureSchema } from "@/features/admin/features/schema"
import {
  getAdminFeatures,
  updateAdminFeature,
} from "@/features/admin/features/service"
import { getRequestUserId } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"

/** True when the given user is a platform admin (system role ADMIN). */
async function isAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  })
  return user?.role === "ADMIN"
}

/**
 * GET /api/mobile/features — beta feature flags (platform admin only).
 */
export async function GET(request: Request) {
  try {
    const userId = await getRequestUserId(request)
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (!(await isAdmin(userId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const features = await getAdminFeatures()
    return NextResponse.json(features)
  } catch (error) {
    console.error("[Mobile Features API] GET error:", error)
    return NextResponse.json({ error: "Failed to fetch features" }, { status: 500 })
  }
}

/**
 * PUT /api/mobile/features — toggle a beta feature (platform admin only).
 * Body: { feature, enabled?, config? }.
 */
export async function PUT(request: Request) {
  try {
    const userId = await getRequestUserId(request)
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (!(await isAdmin(userId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const parsed = UpdateAdminFeatureSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "Feature is required" }, { status: 400 })
    }

    const updated = await updateAdminFeature(parsed.data)
    return NextResponse.json(updated)
  } catch (error) {
    console.error("[Mobile Features API] PUT error:", error)
    return NextResponse.json({ error: "Failed to update feature" }, { status: 500 })
  }
}
