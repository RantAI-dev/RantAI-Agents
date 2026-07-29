import { NextResponse } from "next/server"

import { CreateDashboardSkillSchema } from "@/features/skills/schema"
import {
  createDashboardSkillRecord,
  listDashboardSkills,
} from "@/features/skills/service"
import { listMobileSkills } from "@/lib/mobile-chat"
import { getRequestUserId } from "@/lib/mobile-auth"
import { getMobileContext } from "@/lib/mobile-org"

function isServiceError(
  value: unknown
): value is { status: number; error: string } {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as { status?: unknown; error?: unknown }
  return typeof candidate.status === "number" && typeof candidate.error === "string"
}

/**
 * GET /api/mobile/skills
 * Default: skills selectable in the mobile composer (per-user).
 * `?scope=manage`: full org skill catalog for the Settings management screen.
 */
export async function GET(req: Request) {
  const scope = new URL(req.url).searchParams.get("scope")

  if (scope === "manage") {
    const ctx = await getMobileContext(req)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    try {
      return NextResponse.json(
        await listDashboardSkills({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
        })
      )
    } catch (error) {
      console.error("[Mobile Skills] manage list error:", error)
      return NextResponse.json({ error: "Failed to load skills" }, { status: 500 })
    }
  }

  const userId = await getRequestUserId(req)
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    return NextResponse.json(await listMobileSkills(userId))
  } catch (error) {
    console.error("[Mobile Skills] error:", error)
    return NextResponse.json({ error: "Gagal memuat skills" }, { status: 500 })
  }
}

/**
 * POST /api/mobile/skills — create a custom org skill.
 * Body: { name, displayName, content, description?, category?, tags? }.
 */
export async function POST(req: Request) {
  try {
    const ctx = await getMobileContext(req)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const parsed = CreateDashboardSkillSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const result = await createDashboardSkillRecord({
      context: { organizationId: ctx.organizationId, userId: ctx.userId },
      input: parsed.data,
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error("[Mobile Skills] POST error:", error)
    return NextResponse.json({ error: "Failed to create skill" }, { status: 500 })
  }
}
