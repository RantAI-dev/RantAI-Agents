import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { chunkDocument, generateEmbeddings, detectFileType } from "@/lib/rag"
import * as path from "path"

// GET - List all documents
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const groupId = searchParams.get("groupId")

    // Build where clause for filtering by group
    const whereClause = groupId
      ? { groups: { some: { groupId } } }
      : {}

    const documents = await prisma.document.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { chunks: true },
        },
        groups: {
          include: {
            group: {
              select: { id: true, name: true, color: true },
            },
          },
        },
      },
    })

    return NextResponse.json({
      documents: documents.map((doc) => ({
        id: doc.id,
        title: doc.title,
        categories: doc.categories,
        subcategory: doc.subcategory,
        fileType: (doc.metadata as { fileType?: string } | null)?.fileType || "markdown",
        chunkCount: doc._count.chunks,
        groups: doc.groups.map((dg) => dg.group),
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error("Failed to list documents:", error)
    return NextResponse.json(
      { error: "Failed to list documents" },
      { status: 500 }
    )
  }
}

// POST - Create a new document
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const contentType = request.headers.get("content-type") || ""

    let title: string
    let content: string
    let categories: string[] = []
    let subcategory: string | undefined
    let groupIds: string[] = []
    let fileType: "markdown" | "pdf" | "image" = "markdown"
    let fileData: string | undefined // Base64 for PDFs/images

    if (contentType.includes("multipart/form-data")) {
      // Handle file upload
      const formData = await request.formData()
      const file = formData.get("file") as File | null
      title = formData.get("title") as string
      const categoryStr = formData.get("categories") as string
      // Handle JSON array or comma-separated string
      try {
        categories = JSON.parse(categoryStr)
      } catch {
        categories = categoryStr ? categoryStr.split(",").filter(Boolean) : []
      }
      subcategory = formData.get("subcategory") as string | undefined
      const groupIdsStr = formData.get("groupIds") as string
      // Handle JSON array or comma-separated string
      try {
        groupIds = JSON.parse(groupIdsStr)
      } catch {
        groupIds = groupIdsStr ? groupIdsStr.split(",").filter(Boolean) : []
      }

      if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 })
      }

      const fileName = file.name.toLowerCase()
      const fileBuffer = Buffer.from(await file.arrayBuffer())
      const detectedType = detectFileType(file.name)

      if (detectedType === "pdf") {
        fileType = "pdf"
        // Store PDF as base64 for viewing/downloading
        fileData = fileBuffer.toString("base64")

        // Use pdf-parse for proper text extraction
        try {
          const pdfParse = (await import("pdf-parse")).default
          const pdfData = await pdfParse(fileBuffer)
          content = pdfData.text
        } catch (pdfError) {
          console.error("PDF parsing error:", pdfError)
          // Fallback to basic extraction
          content = `[PDF Document: ${title || file.name}]\n\nFailed to extract text from PDF.`
        }
      } else if (detectedType === "image") {
        fileType = "image"
        // Store image as base64 for viewing
        fileData = fileBuffer.toString("base64")

        // Use vision model to extract description
        try {
          const ext = path.extname(file.name).toLowerCase()
          const mimeTypes: Record<string, string> = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".webp": "image/webp",
            ".heic": "image/heic",
          }
          const mimeType = mimeTypes[ext] || "image/png"

          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "openai/gpt-4o-mini",
              messages: [
                {
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text: `Analyze this image and provide:
1. A detailed description of what the image shows
2. Any text visible in the image (OCR)
3. Key information or data points visible

Format your response as structured text that can be used for search and retrieval. Be thorough but concise.`,
                    },
                    {
                      type: "image_url",
                      image_url: {
                        url: `data:${mimeType};base64,${fileData}`,
                      },
                    },
                  ],
                },
              ],
              max_tokens: 1500,
            }),
          })

          if (!response.ok) {
            throw new Error(`Vision API error: ${response.status}`)
          }

          const data = await response.json()
          const description = data.choices[0]?.message?.content || ""
          content = `[Image: ${file.name}]\n\n${description}`
        } catch (visionError) {
          console.error("Vision processing error:", visionError)
          content = `[Image: ${file.name}]\n\nFailed to process image with vision model.`
        }
      } else {
        // Markdown or text file
        fileType = "markdown"
        content = fileBuffer.toString("utf-8")
      }

      if (!title) {
        title = file.name.replace(/\.[^/.]+$/, "")
      }
    } else {
      // Handle JSON body
      const body = await request.json()
      title = body.title
      content = body.content
      categories = Array.isArray(body.categories) ? body.categories : [body.categories].filter(Boolean)
      subcategory = body.subcategory
      groupIds = Array.isArray(body.groupIds) ? body.groupIds : []
    }

    if (!title || !content || categories.length === 0) {
      return NextResponse.json(
        { error: "Title, content, and at least one category are required" },
        { status: 400 }
      )
    }

    // Create document with metadata
    const metadata = fileData
      ? { fileType, fileData }
      : { fileType }

    const document = await prisma.document.create({
      data: {
        title,
        content,
        categories,
        subcategory: subcategory || null,
        metadata: metadata as object,
        groups: groupIds && groupIds.length > 0 ? {
          create: groupIds.map((gId) => ({
            groupId: gId,
          })),
        } : undefined,
      },
      include: {
        groups: {
          include: {
            group: {
              select: { id: true, name: true, color: true },
            },
          },
        },
      },
    })

    // Chunk the content (use first category for chunking metadata)
    const chunks = chunkDocument(content, title, categories[0], subcategory || undefined, {
      chunkSize: 1000,
      chunkOverlap: 200,
    })

    // Generate embeddings for chunks
    const chunkTexts = chunks.map(
      (chunk) => `${title}\n\n${chunk.content}`
    )
    const embeddings = await generateEmbeddings(chunkTexts)

    // Store chunks with embeddings
    for (let i = 0; i < chunks.length; i++) {
      await prisma.$executeRaw`
        INSERT INTO "DocumentChunk" (id, "documentId", content, "chunkIndex", embedding, "createdAt")
        VALUES (
          ${`chunk-${document.id}-${i}`},
          ${document.id},
          ${chunks[i].content},
          ${i},
          ${embeddings[i]}::vector,
          NOW()
        )
      `
    }

    return NextResponse.json({
      id: document.id,
      title: document.title,
      categories: document.categories,
      groups: document.groups.map((dg) => dg.group),
      fileType,
      chunkCount: chunks.length,
    })
  } catch (error) {
    console.error("Failed to create document:", error)
    return NextResponse.json(
      { error: "Failed to create document" },
      { status: 500 }
    )
  }
}
