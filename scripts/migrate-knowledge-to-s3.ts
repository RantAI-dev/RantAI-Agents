import { PrismaClient, Prisma } from "@prisma/client"
import { ensureBucket, uploadFile, S3Paths } from "../src/lib/s3"

const prisma = new PrismaClient()

type DocRow = {
  id: string
  title: string
  content: string
  organizationId: string | null
  s3Key: string | null
  fileType: string | null
  artifactType: string | null
  sessionId: string | null
  metadata: Prisma.JsonValue | null
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "document"
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes("--dry-run")

  const candidates = (await prisma.document.findMany({
    where: {
      s3Key: null,
      artifactType: null,
      sessionId: null,
    },
    select: {
      id: true,
      title: true,
      content: true,
      organizationId: true,
      s3Key: true,
      fileType: true,
      artifactType: true,
      sessionId: true,
      metadata: true,
    },
    orderBy: { createdAt: "asc" },
  })) as DocRow[]

  const docs = candidates.filter((d) => d.content.trim().length > 0)

  console.log(`Knowledge docs eligible: ${docs.length} (${dryRun ? "dry-run" : "live"})`)

  if (!dryRun) {
    await ensureBucket()
  }

  let migrated = 0
  let failed = 0

  for (const doc of docs) {
    try {
      const filename = `${slugify(doc.title)}.md`
      const key = S3Paths.document(doc.organizationId, doc.id, filename)
      const buffer = Buffer.from(doc.content, "utf-8")

      if (dryRun) {
        console.log(`[DRY] ${doc.id} -> ${key}`)
        migrated++
        continue
      }

      const uploaded = await uploadFile(key, buffer, "text/markdown", {
        documentId: doc.id,
        source: "knowledge-content-migration",
        migratedAt: new Date().toISOString(),
      })

      const currentMeta = isObject(doc.metadata) ? doc.metadata : {}

      await prisma.document.update({
        where: { id: doc.id },
        data: {
          s3Key: uploaded.key,
          fileType: "markdown",
          mimeType: "text/markdown",
          fileSize: uploaded.size,
          metadata: {
            ...currentMeta,
            s3MigratedFromContent: true,
            s3MigratedAt: new Date().toISOString(),
          },
        },
      })

      migrated++
      console.log(`[OK ] ${doc.id} -> ${uploaded.key}`)
    } catch (error) {
      failed++
      console.error(`[ERR] ${doc.id}:`, error instanceof Error ? error.message : String(error))
    }
  }

  console.log(`Done. migrated=${migrated} failed=${failed}`)

  if (failed > 0) {
    process.exitCode = 1
  }
}

main()
  .catch((error) => {
    console.error("Migration failed:", error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
