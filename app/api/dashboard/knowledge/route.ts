import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext, canEdit } from "@/lib/organization"
import {
  chunkDocument,
  smartChunkDocument,
  generateEmbeddings,
  detectFileType,
  storeChunks,
  getDocumentChunkCount,
} from "@/lib/rag"
import { extractEntities, extractEntitiesAndRelations } from "@/lib/document-intelligence"
import { getSurrealClient } from "@/lib/surrealdb"
import * as path from "path"

// GET - List all documents
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const groupId = searchParams.get("groupId")

    // Get organization context
    const orgContext = await getOrganizationContext(request, session.user.id)

    // Build where clause for filtering by group and organization
    const whereClause: Record<string, unknown> = {}

    if (groupId) {
      whereClause.groups = { some: { groupId } }
    }

    // Filter by organization
    if (orgContext) {
      whereClause.organizationId = orgContext.organizationId
    } else {
      whereClause.organizationId = null
    }

    const documents = await prisma.document.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
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

    // Get chunk counts from SurrealDB for each document
    const documentsWithCounts = await Promise.all(
      documents.map(async (doc) => {
        const chunkCount = await getDocumentChunkCount(doc.id)
        return {
          id: doc.id,
          title: doc.title,
          categories: doc.categories,
          subcategory: doc.subcategory,
          fileType: (doc.metadata as { fileType?: string } | null)?.fileType || "markdown",
          chunkCount,
          groups: doc.groups.map((dg) => dg.group),
          createdAt: doc.createdAt.toISOString(),
          updatedAt: doc.updatedAt.toISOString(),
        }
      })
    )

    return NextResponse.json({
      documents: documentsWithCounts,
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
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // Get organization context
    const orgContext = await getOrganizationContext(request, session.user.id)

    // Check permission if organization context exists
    if (orgContext && !canEdit(orgContext.membership.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      )
    }

    // Check organization limits if creating within an org
    if (orgContext) {
      const organization = await prisma.organization.findUnique({
        where: { id: orgContext.organizationId },
        include: {
          _count: { select: { documents: true } },
        },
      })

      if (organization && organization._count.documents >= organization.maxDocuments) {
        return NextResponse.json(
          { error: `Organization has reached the maximum of ${organization.maxDocuments} documents` },
          { status: 400 }
        )
      }
    }

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

        // Use unpdf for serverless-compatible text extraction
        try {
          const { extractText, getDocumentProxy } = await import("unpdf")
          const pdf = await getDocumentProxy(new Uint8Array(fileBuffer))
          const { text } = await extractText(pdf, { mergePages: true })
          content = text
        } catch (pdfError) {
          console.error("PDF parsing error:", pdfError)
          // Fallback to placeholder
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
        organizationId: orgContext?.organizationId || null,
        createdBy: session.user.id,
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

    // Check if enhanced processing is requested
    const { searchParams } = new URL(request.url)
    const useEnhanced = searchParams.get("enhanced") === "true"

    let chunks
    let entityCount = 0

    if (useEnhanced) {
      // Use smart chunking (semantic-aware)
      chunks = await smartChunkDocument(content, title, categories[0], subcategory || undefined, {
        maxChunkSize: 800,
        overlapSize: 200,
        preserveCodeBlocks: true,
        respectHeadingBoundaries: true,
      })

      // Check if combined extraction is enabled (98.5% fewer API calls)
      const useCombined = searchParams.get("combined") !== "false"

      // Extract entities and relations from the content
      try {
        const surrealClient = await getSurrealClient()

        if (useCombined) {
          // Combined extraction: entities + relations in single pass
          console.log(`[Knowledge API] Using combined extraction for document ${document.id}`)
          const { entities, relations } = await extractEntitiesAndRelations(
            content,
            document.id,
            session.user.id
          )
          entityCount = entities.length

          // Store entities in SurrealDB (use UPSERT to handle duplicates gracefully)
          const entityIdMap = new Map<string, string>() // name -> id
          for (const entity of entities) {
            // Sanitize name for use in record ID (alphanumeric and underscore only)
            const sanitizedName = entity.name.toLowerCase().replace(/[^a-z0-9]/g, "_")
            const entityId = `entity:${document.id}_${sanitizedName}`

            try {
              // SurrealDB UPSERT requires the record ID directly in the query, not as a variable
              await surrealClient.query(
                `UPSERT entity:\`${document.id}_${sanitizedName}\` CONTENT {
                  name: $name,
                  type: $type,
                  confidence: $confidence,
                  document_id: $document_id,
                  file_id: $file_id,
                  metadata: $metadata,
                  updated_at: time::now()
                }`,
                {
                  name: entity.name,
                  type: entity.type,
                  confidence: entity.confidence,
                  document_id: document.id,
                  file_id: document.id,
                  metadata: entity.metadata,
                }
              )
            } catch (entityError) {
              console.warn(`[Knowledge API] Failed to upsert entity ${entityId}:`, entityError)
            }
            entityIdMap.set(entity.name.toLowerCase(), entityId)
          }

          // Store relations using RELATE syntax
          if (relations.length > 0) {
            console.log(`[Knowledge API] Creating ${relations.length} relations`)
            for (const relation of relations) {
              const sourceId = entityIdMap.get(relation.metadata?.source_entity?.toLowerCase() || "")
              const targetId = entityIdMap.get(relation.metadata?.target_entity?.toLowerCase() || "")

              if (sourceId && targetId) {
                try {
                  await surrealClient.relate(
                    sourceId,
                    relation.relation_type,
                    targetId,
                    {
                      confidence: relation.confidence,
                      document_id: document.id,
                      context: relation.metadata?.context,
                      created_at: new Date().toISOString(),
                    }
                  )
                } catch (relateError) {
                  console.warn(`[Knowledge API] Failed to create relation ${sourceId} -> ${targetId}:`, relateError)
                }
              }
            }
          }
        } else {
          // Legacy: extract entities only
          const entities = await extractEntities(content, document.id, undefined, {
            useLLM: true,
            usePatterns: true,
          })
          entityCount = entities.length

          // Store entities in SurrealDB (use UPSERT to handle duplicates)
          for (const entity of entities) {
            const sanitizedName = entity.name.toLowerCase().replace(/[^a-z0-9]/g, "_")
            const entityId = `entity:${document.id}_${sanitizedName}`

            try {
              // SurrealDB UPSERT requires the record ID directly in the query
              await surrealClient.query(
                `UPSERT entity:\`${document.id}_${sanitizedName}\` CONTENT {
                  name: $name,
                  type: $type,
                  confidence: $confidence,
                  document_id: $document_id,
                  file_id: $file_id,
                  metadata: $metadata,
                  updated_at: time::now()
                }`,
                {
                  name: entity.name,
                  type: entity.type,
                  confidence: entity.confidence,
                  document_id: document.id,
                  file_id: document.id,
                  metadata: entity.metadata,
                }
              )
            } catch (entityError) {
              console.warn(`[Knowledge API] Failed to upsert entity ${entityId}:`, entityError)
            }
          }
        }
      } catch (entityError) {
        console.error("Entity/Relation extraction failed:", entityError)
        // Continue without entities - not a fatal error
      }
    } else {
      // Use basic chunking (original behavior)
      chunks = chunkDocument(content, title, categories[0], subcategory || undefined, {
        chunkSize: 1000,
        chunkOverlap: 200,
      })
    }

    // Generate embeddings for chunks
    const chunkTexts = chunks.map(
      (chunk) => `${title}\n\n${chunk.content}`
    )
    const embeddings = await generateEmbeddings(chunkTexts)

    // Store chunks with embeddings in SurrealDB
    await storeChunks(document.id, chunks, embeddings)

    return NextResponse.json({
      id: document.id,
      title: document.title,
      categories: document.categories,
      groups: document.groups.map((dg) => dg.group),
      fileType,
      chunkCount: chunks.length,
      entityCount: useEnhanced ? entityCount : undefined,
      enhanced: useEnhanced,
    })
  } catch (error) {
    console.error("Failed to create document:", error)
    return NextResponse.json(
      { error: "Failed to create document" },
      { status: 500 }
    )
  }
}
