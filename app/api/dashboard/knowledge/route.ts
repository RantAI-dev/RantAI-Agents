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
import { uploadFile, S3Paths, validateUpload, getPresignedDownloadUrl } from "@/lib/s3"
import { processDocumentOCR, isPDFScanned } from "@/lib/ocr"
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
        // Use new schema field or fallback to metadata for backward compat
        const fileType = doc.fileType || (doc.metadata as { fileType?: string } | null)?.fileType || "markdown"
        return {
          id: doc.id,
          title: doc.title,
          categories: doc.categories,
          subcategory: doc.subcategory,
          fileType,
          fileSize: doc.fileSize,
          hasS3File: !!doc.s3Key,
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
    let fileBuffer: Buffer | undefined
    let mimeType: string | undefined
    let originalFilename: string | undefined
    let usedOCR = false // Track if OCR was used for processing

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

      // Check for forceOCR option (form field or query param)
      const { searchParams } = new URL(request.url)
      const forceOCRParam = searchParams.get("forceOCR")
      const forceOCRField = formData.get("forceOCR") as string | null
      const forceOCR = forceOCRParam === "true" || forceOCRField === "true"

      // Document type hint for better OCR model selection
      // Options: printed_text, handwritten, table, form, figure, mixed
      const documentTypeHint = (formData.get("documentType") as string | null) ||
        searchParams.get("documentType") || undefined

      if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 })
      }

      // Validate file upload
      const validation = validateUpload("document", file.size, file.type)
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 })
      }

      originalFilename = file.name
      mimeType = file.type
      const detectedType = detectFileType(file.name)
      fileBuffer = Buffer.from(await file.arrayBuffer())

      if (detectedType === "pdf") {
        fileType = "pdf"

        // Check if OCR should be used:
        // 1. forceOCR=true explicitly requests OCR
        // 2. Auto-detect: PDF is scanned (< 100 chars/page)
        const isScanned = forceOCR || await isPDFScanned(fileBuffer)

        if (isScanned) {
          // Use OCR pipeline (forced or auto-detected scanned PDF)
          const reason = forceOCR ? "forceOCR=true" : "auto-detected scanned"
          console.log(`[Knowledge API] Using OCR for PDF (${reason}): ${file.name}`)
          try {
            const ocrResult = await processDocumentOCR(fileBuffer, "application/pdf", {
              outputFormat: "markdown",
              documentType: documentTypeHint as "printed_text" | "handwritten" | "table" | "form" | "figure" | "mixed" | undefined,
            })
            content = "combinedText" in ocrResult ? ocrResult.combinedText : ocrResult.text
            usedOCR = true
          } catch (ocrError) {
            console.error("OCR processing error:", ocrError)
            content = `[PDF Document: ${title || file.name}]\n\nFailed to OCR PDF.`
          }
        } else {
          // Digital PDF - use unpdf for serverless-compatible text extraction
          try {
            const { extractText, getDocumentProxy } = await import("unpdf")
            const pdf = await getDocumentProxy(new Uint8Array(fileBuffer))
            const { text } = await extractText(pdf, { mergePages: true })
            content = text
          } catch (pdfError) {
            console.error("PDF parsing error:", pdfError)
            content = `[PDF Document: ${title || file.name}]\n\nFailed to extract text from PDF.`
          }
        }
      } else if (detectedType === "image") {
        fileType = "image"

        // Use OCR pipeline (Ollama local models with OpenRouter fallback)
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
          const imgMimeType = mimeTypes[ext] || "image/png"

          console.log(`[Knowledge API] Processing image with OCR: ${file.name}`)
          const ocrResult = await processDocumentOCR(fileBuffer, imgMimeType, {
            outputFormat: "markdown",
            documentType: documentTypeHint as "printed_text" | "handwritten" | "table" | "form" | "figure" | "mixed" | undefined,
          })
          const text = "combinedText" in ocrResult ? ocrResult.combinedText : ocrResult.text
          content = `[Image: ${file.name}]\n\n${text}`
          usedOCR = true
        } catch (ocrError) {
          console.error("OCR processing error:", ocrError)
          content = `[Image: ${file.name}]\n\nFailed to process image with OCR.`
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

    // Generate document ID first so we can use it for S3 path
    const documentId = crypto.randomUUID()

    // Upload file to S3 if present (PDF or image)
    let s3Key: string | undefined
    let fileSize: number | undefined

    if (fileBuffer && (fileType === "pdf" || fileType === "image")) {
      try {
        s3Key = S3Paths.document(
          orgContext?.organizationId || null,
          documentId,
          originalFilename || "file"
        )
        const uploadResult = await uploadFile(s3Key, fileBuffer, mimeType || "application/octet-stream", {
          documentId,
          fileType,
          originalFilename: originalFilename || "file",
        })
        fileSize = uploadResult.size
        console.log(`[Knowledge API] Uploaded file to S3: ${s3Key}`)
      } catch (s3Error) {
        console.error("[Knowledge API] S3 upload failed:", s3Error)
        // Continue without S3 - file content is already extracted
        s3Key = undefined
      }
    }

    // Create document with S3 reference (no more base64 in metadata)
    const document = await prisma.document.create({
      data: {
        id: documentId,
        title,
        content,
        categories,
        subcategory: subcategory || null,
        metadata: { fileType } as object, // Only store fileType, no fileData
        s3Key,
        fileType,
        fileSize,
        mimeType,
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

    // Generate presigned URL if file was uploaded to S3
    let fileUrl: string | undefined
    if (s3Key) {
      try {
        fileUrl = await getPresignedDownloadUrl(s3Key)
      } catch (urlError) {
        console.error("[Knowledge API] Failed to generate presigned URL:", urlError)
      }
    }

    return NextResponse.json({
      id: document.id,
      title: document.title,
      categories: document.categories,
      groups: document.groups.map((dg) => dg.group),
      fileType,
      fileSize,
      s3Key,
      fileUrl,
      chunkCount: chunks.length,
      entityCount: useEnhanced ? entityCount : undefined,
      enhanced: useEnhanced,
      usedOCR,
    })
  } catch (error) {
    console.error("Failed to create document:", error)
    return NextResponse.json(
      { error: "Failed to create document" },
      { status: 500 }
    )
  }
}
