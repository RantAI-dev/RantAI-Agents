#!/usr/bin/env bun
/**
 * Seed the "Buku Smart Campus" demo KB with a folder of PDFs, through the
 * BACKGROUND ingest pipeline (enhanced + forced layout extraction so
 * figures/tables are captured — the SOTA path). Idempotent-ish: re-running
 * re-enqueues; delete the KB's docs first for a clean reseed.
 *
 * The demo owner + org must already exist (sign up the email at /signup, or run
 * the base seed) — this script only resolves the org and enqueues the files.
 *
 * On the prod app host:
 *   docker compose exec -T app sh -lc \
 *     'cd packages/rantai-agents && SEED_EMAIL=aksaramaya@rantai.dev \
 *      SEED_DIR=/opt/rantai-cloud/samples/smart-campus bun scripts/seed-smartcampus.ts'
 *
 * Env:
 *   SEED_EMAIL   owner email of the demo org (default aksaramaya@rantai.dev)
 *   SEED_DIR     directory containing the PDFs (required)
 *   SEED_KB      KB group name (default "Buku Smart Campus")
 * Requires the usual ingest env (DATABASE_URL, S3_*, KB_MISTRAL_OCR_KEY for
 * figures, OPENROUTER_API_KEY for embeddings).
 */
import { readdir, readFile } from "fs/promises"
import { join } from "path"
import { PrismaClient } from "@prisma/client"
import { enqueueFileIngest } from "@/features/knowledge/documents/service"

const prisma = new PrismaClient()

const SEED_EMAIL = process.env.SEED_EMAIL ?? "aksaramaya@rantai.dev"
const SEED_DIR = process.env.SEED_DIR ?? ""
const KB_NAME = process.env.SEED_KB ?? "Buku Smart Campus"

async function bestEffortTitle(buf: Buffer, fallback: string): Promise<string> {
  try {
    const { getDocumentProxy, getMeta } = await import("unpdf")
    const pdf = await getDocumentProxy(new Uint8Array(buf))
    const meta = await getMeta(pdf)
    const title = ((meta?.info ?? {}) as { Title?: string }).Title?.trim() ?? ""
    if (title.length > 2 && !/^untitled$/i.test(title)) return title
  } catch {
    /* fall through */
  }
  return fallback
}

async function main() {
  if (!SEED_DIR) {
    console.error("[seed] SEED_DIR is required (directory of PDFs).")
    process.exit(1)
  }

  const member = await prisma.organizationMember.findFirst({
    where: { userEmail: SEED_EMAIL },
    select: { organizationId: true, userId: true },
  })
  if (!member?.organizationId) {
    console.error(`[seed] no organization for ${SEED_EMAIL} — sign that email up at /signup first.`)
    process.exit(1)
  }
  const orgId = member.organizationId
  const userId = member.userId

  let kb = await prisma.knowledgeBaseGroup.findFirst({
    where: { organizationId: orgId, name: KB_NAME },
    select: { id: true },
  })
  if (!kb) {
    kb = await prisma.knowledgeBaseGroup.create({
      data: { name: KB_NAME, description: "Buku Smart Campus — demo KB", color: "#3b82f6", organizationId: orgId, createdBy: userId },
      select: { id: true },
    })
    console.log(`[seed] created KB "${KB_NAME}" → ${kb.id}`)
  } else {
    console.log(`[seed] using existing KB "${KB_NAME}" → ${kb.id}`)
  }

  const files = (await readdir(SEED_DIR)).filter((f) => f.toLowerCase().endsWith(".pdf")).sort()
  console.log(`[seed] ${files.length} PDF(s) in ${SEED_DIR} → enqueue (enhanced + forceOCR) for org ${orgId}`)

  let queued = 0
  let failed = 0
  for (const name of files) {
    const buf = await readFile(join(SEED_DIR, name))
    const fallback = `Smart Campus — ${name.replace(/\.pdf$/i, "").slice(0, 8)}`
    const title = await bestEffortTitle(buf, fallback)
    const file = new File([new Uint8Array(buf)], name, { type: "application/pdf" })
    try {
      const res = await enqueueFileIngest({
        context: { userId: userId ?? SEED_EMAIL, organizationId: orgId, role: "owner" },
        input: {
          kind: "file",
          file,
          title,
          categories: [],
          subcategory: null,
          groupIds: [kb.id],
          useEnhanced: true,
          useCombined: true,
          forceOCR: true,
        },
      })
      if (res && typeof res === "object" && "error" in res) {
        console.log(`[seed] FAIL  ${name}: ${(res as { error: string }).error}`)
        failed++
      } else {
        console.log(`[seed] queued ${title.slice(0, 44)}`)
        queued++
      }
    } catch (err) {
      console.log(`[seed] THROW ${name}: ${(err as Error).message}`)
      failed++
    }
  }

  console.log(`[seed] done — ${queued} queued, ${failed} failed. The ingest worker will process them.`)
  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error("[seed] fatal:", err)
  await prisma.$disconnect()
  process.exit(1)
})
