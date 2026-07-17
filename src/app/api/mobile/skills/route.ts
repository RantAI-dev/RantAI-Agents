import { NextResponse } from "next/server"

import { listMobileSkills } from "@/lib/mobile-chat"
import { getRequestUserId } from "@/lib/mobile-auth"

/**
 * GET /api/mobile/skills
 * Daftar skill yang bisa dipilih user pada composer mobile.
 */
export async function GET(req: Request) {
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
