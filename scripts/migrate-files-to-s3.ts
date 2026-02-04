/**
 * Migration script to move existing base64 file data from PostgreSQL to S3
 *
 * Usage:
 *   pnpm migrate:s3              # Run migration
 *   pnpm migrate:s3:dry-run      # Preview what would be migrated
 *   pnpm migrate:s3 --resume=id  # Resume from a specific document ID
 *
 * What it does:
 * 1. Finds all documents with metadata.fileData (base64)
 * 2. Decodes base64 to buffer
 * 3. Uploads to S3 with proper path structure
 * 4. Updates document record with s3Key and clears fileData from metadata
 */

import { PrismaClient } from "@prisma/client"
import { uploadFile, S3Paths, ensureBucket } from "../lib/s3"

const prisma = new PrismaClient()

interface DocumentMetadata {
  fileType?: "markdown" | "pdf" | "image"
  fileData?: string
}

interface MigrationStats {
  total: number
  migrated: number
  skipped: number
  failed: number
  errors: Array<{ id: string; title: string; error: string }>
}

async function migrateDocumentsToS3(options: {
  dryRun: boolean
  resumeFromId?: string
  batchSize?: number
}): Promise<MigrationStats> {
  const { dryRun, resumeFromId, batchSize = 10 } = options

  const stats: MigrationStats = {
    total: 0,
    migrated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  }

  console.log("\n=== S3 Migration Script ===\n")
  console.log(`Mode: ${dryRun ? "DRY RUN (no changes will be made)" : "LIVE MIGRATION"}`)
  if (resumeFromId) {
    console.log(`Resuming from document ID: ${resumeFromId}`)
  }
  console.log("")

  // Ensure bucket exists before migration
  if (!dryRun) {
    try {
      await ensureBucket()
      console.log("S3 bucket verified/created successfully\n")
    } catch (error) {
      console.error("Failed to ensure S3 bucket exists:", error)
      console.error("\nPlease make sure RustFS is running and S3 credentials are correct.")
      process.exit(1)
    }
  }

  // Build query to find documents that haven't been migrated yet
  // We'll filter by s3Key being null (not yet migrated)
  // Then check for fileData presence during processing
  const whereClause = {
    s3Key: null, // Not yet migrated
    ...(resumeFromId && { id: { gte: resumeFromId } }),
  }

  // Get total count of documents without s3Key
  const totalCount = await prisma.document.count({
    where: whereClause,
  })

  console.log(`Found ${totalCount} documents to check\n`)

  // Process in batches
  let cursor: string | undefined
  let processed = 0

  while (true) {
    const documents = await prisma.document.findMany({
      where: whereClause,
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor && {
        skip: 1,
        cursor: { id: cursor },
      }),
      select: {
        id: true,
        title: true,
        metadata: true,
        organizationId: true,
        fileType: true,
        mimeType: true,
      },
    })

    if (documents.length === 0) break

    for (const doc of documents) {
      stats.total++
      processed++

      const metadata = doc.metadata as DocumentMetadata | null

      // Skip if no fileData
      if (!metadata?.fileData) {
        console.log(`[${processed}/${totalCount}] SKIP: ${doc.title} (no fileData)`)
        stats.skipped++
        continue
      }

      const fileType = doc.fileType || metadata.fileType || "markdown"

      // Skip markdown files (they don't have binary data)
      if (fileType === "markdown") {
        console.log(`[${processed}/${totalCount}] SKIP: ${doc.title} (markdown)`)
        stats.skipped++
        continue
      }

      console.log(`[${processed}/${totalCount}] Processing: ${doc.title} (${fileType})`)

      if (dryRun) {
        console.log(`  -> Would migrate to S3: documents/${doc.organizationId || "global"}/${doc.id}/file`)
        stats.migrated++
        continue
      }

      try {
        // Decode base64 to buffer
        const buffer = Buffer.from(metadata.fileData, "base64")

        // Determine mime type and extension
        let mimeType = doc.mimeType || "application/octet-stream"
        let extension = "bin"

        if (fileType === "pdf") {
          mimeType = "application/pdf"
          extension = "pdf"
        } else if (fileType === "image") {
          // Try to detect image type from base64 or default to png
          if (metadata.fileData.startsWith("/9j/")) {
            mimeType = "image/jpeg"
            extension = "jpg"
          } else if (metadata.fileData.startsWith("iVBORw")) {
            mimeType = "image/png"
            extension = "png"
          } else if (metadata.fileData.startsWith("R0lGOD")) {
            mimeType = "image/gif"
            extension = "gif"
          } else if (metadata.fileData.startsWith("UklGR")) {
            mimeType = "image/webp"
            extension = "webp"
          } else {
            mimeType = doc.mimeType || "image/png"
            extension = "png"
          }
        }

        // Generate S3 key
        const filename = `file.${extension}`
        const s3Key = S3Paths.document(doc.organizationId, doc.id, filename)

        // Upload to S3
        const uploadResult = await uploadFile(s3Key, buffer, mimeType, {
          documentId: doc.id,
          fileType,
          migratedAt: new Date().toISOString(),
        })

        // Update document record
        const { fileData: _, ...cleanMetadata } = metadata
        await prisma.document.update({
          where: { id: doc.id },
          data: {
            s3Key: uploadResult.key,
            fileSize: uploadResult.size,
            fileType,
            mimeType,
            metadata: cleanMetadata, // Remove fileData from metadata
          },
        })

        console.log(`  -> Migrated to S3: ${s3Key} (${formatBytes(uploadResult.size)})`)
        stats.migrated++
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        console.error(`  -> FAILED: ${errorMsg}`)
        stats.failed++
        stats.errors.push({
          id: doc.id,
          title: doc.title,
          error: errorMsg,
        })
      }
    }

    cursor = documents[documents.length - 1].id
  }

  return stats
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

function printSummary(stats: MigrationStats, dryRun: boolean): void {
  console.log("\n=== Migration Summary ===\n")
  console.log(`Mode:     ${dryRun ? "DRY RUN" : "LIVE"}`)
  console.log(`Total:    ${stats.total} documents`)
  console.log(`Migrated: ${stats.migrated}`)
  console.log(`Skipped:  ${stats.skipped}`)
  console.log(`Failed:   ${stats.failed}`)

  if (stats.errors.length > 0) {
    console.log("\n=== Failed Documents ===\n")
    for (const err of stats.errors) {
      console.log(`- ${err.title} (${err.id}): ${err.error}`)
    }
  }

  if (dryRun) {
    console.log("\nThis was a dry run. Run without --dry-run to perform actual migration.")
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const dryRun = args.includes("--dry-run")
  const resumeArg = args.find((a) => a.startsWith("--resume="))
  const resumeFromId = resumeArg?.split("=")[1]

  try {
    const stats = await migrateDocumentsToS3({
      dryRun,
      resumeFromId,
    })

    printSummary(stats, dryRun)

    if (stats.failed > 0) {
      process.exit(1)
    }
  } catch (error) {
    console.error("\nMigration failed:", error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
