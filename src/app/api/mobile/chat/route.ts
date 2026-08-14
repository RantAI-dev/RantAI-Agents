import { NextResponse } from "next/server"

import { generateMobileReply, type MobileChatOptions } from "@/lib/mobile-chat"
import { getRequestUserId } from "@/lib/mobile-auth"

/** Ambil opsi tools/skills/canvas dari body request. */
export function readChatOptions(body: Record<string, unknown>): MobileChatOptions {
  const strings = (v: unknown) =>
    Array.isArray(v) ? v.filter((n): n is string => typeof n === "string") : undefined
  const canvasMode = typeof body.canvasMode === "string" ? body.canvasMode.trim() : ""
  const fileContext = typeof body.fileContext === "string" ? body.fileContext.trim() : ""

  return {
    enableWebSearch: body.enableWebSearch === true,
    enableCodeInterpreter: body.enableCodeInterpreter === true,
    enabledToolNames: strings(body.enabledToolNames),
    enabledSkillIds: strings(body.enabledSkillIds),
    canvasMode: canvasMode || undefined,
    fileContext: fileContext || undefined,
  }
}

/**
 * POST /api/mobile/chat
 * Body: { sessionId, content, enableWebSearch?, enableCodeInterpreter?,
 *         enabledToolNames?, enabledSkillIds?, canvasMode?, fileContext? }
 * Menyimpan pesan user, menghasilkan balasan AI (non-streaming), menyimpannya,
 * lalu mengembalikan { reply }.
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
  const content = typeof body.content === "string" ? body.content.trim() : ""
  if (!sessionId || !content) {
    return NextResponse.json(
      { error: "sessionId dan content wajib diisi" },
      { status: 400 }
    )
  }

  const result = await generateMobileReply({
    userId,
    sessionId,
    content,
    replyTo: typeof body.replyTo === "string" ? body.replyTo.trim() || undefined : undefined,
    options: readChatOptions(body),
  })
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json(result)
}
