import { NextResponse } from "next/server"

import { regenerateMobileReply } from "@/lib/mobile-chat"
import { getRequestUserId } from "@/lib/mobile-auth"
import { readChatOptions } from "../route"

/**
 * POST /api/mobile/chat/regenerate
 * Body: { sessionId, ...opsi tools/skills/canvas }
 * Membuang balasan asisten terakhir lalu menghasilkan balasan baru dari
 * riwayat yang tersisa. Pesan user tidak ditulis ulang.
 */
export async function POST(req: Request) {
  const userId = await getRequestUserId(req)
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : ""
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId wajib diisi" }, { status: 400 })
  }

  const result = await regenerateMobileReply({
    userId,
    sessionId,
    options: readChatOptions(body),
  })
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json(result)
}
