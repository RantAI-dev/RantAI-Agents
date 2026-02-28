import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { processChatFile } from "@/lib/chat/file-processor"
import { CHAT_ATTACHMENT_MIME_TYPES, MIME_TO_EXT } from "@/lib/files/mime-types"
import { writeFile, mkdir } from "fs/promises"
import path from "path"
import crypto from "crypto"

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES: readonly string[] = CHAT_ATTACHMENT_MIME_TYPES

const STORAGE_DIR = path.join(process.cwd(), "storage", "chat-attachments")

export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await req.formData()
    const file = formData.get("file") as File | null
    const sessionId = formData.get("sessionId") as string | null

    if (!file) {
      return NextResponse.json(
        { error: "No file provided", code: "MISSING_FILE" },
        { status: 400 }
      )
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          error: `File type not allowed. Allowed: ${ALLOWED_TYPES.join(", ")}`,
          code: "INVALID_FILE_TYPE",
        },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
          code: "FILE_TOO_LARGE",
        },
        { status: 400 }
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Save original file to disk for later retrieval
    const fileId = crypto.randomUUID()
    const ext = MIME_TO_EXT[file.type] || ""
    const storedFileName = `${fileId}${ext}`
    await mkdir(STORAGE_DIR, { recursive: true })
    await writeFile(path.join(STORAGE_DIR, storedFileName), buffer)

    const result = await processChatFile(buffer, file.type, file.name, {
      sessionId: sessionId || undefined,
      userId: session.user.id,
    })

    return NextResponse.json({
      success: true,
      result: { ...result, fileId: storedFileName },
    })
  } catch (error) {
    console.error("[Chat Upload API] Error:", error)
    return NextResponse.json(
      { error: "Failed to process file", code: "PROCESSING_ERROR" },
      { status: 500 }
    )
  }
}
