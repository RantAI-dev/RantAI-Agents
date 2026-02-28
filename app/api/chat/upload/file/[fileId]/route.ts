import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { readFile, access } from "fs/promises"
import path from "path"

const STORAGE_DIR = path.join(process.cwd(), "storage", "chat-attachments")

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".md": "text/markdown",
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { fileId } = await params

    // Sanitize: only allow uuid + extension, no path traversal
    if (!/^[a-f0-9-]+\.\w+$/.test(fileId)) {
      return NextResponse.json({ error: "Invalid file ID" }, { status: 400 })
    }

    const filePath = path.join(STORAGE_DIR, fileId)

    try {
      await access(filePath)
    } catch {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    const buffer = await readFile(filePath)
    const ext = path.extname(fileId).toLowerCase()
    const contentType = MIME_MAP[ext] || "application/octet-stream"

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=86400",
      },
    })
  } catch (error) {
    console.error("[Chat File Serve] Error:", error)
    return NextResponse.json({ error: "Failed to serve file" }, { status: 500 })
  }
}
