/**
 * Seed the demo organization's Knowledge Base with a sample school textbook,
 * so a fresh deploy's demo user logs in to a ready-to-chat KB (the "sdkelas3"
 * group holding the sample book), matching local dev.
 *
 * Runs the REAL ingest pipeline (layout OCR → chunk → figures → embed → store),
 * so the result is identical to a UI upload: retrievable chunks, inline figures,
 * citations. It is env-agnostic and idempotent — point the standard env at any
 * target (local / staging / prod) and run once.
 *
 * Usage:
 *   # local (loads apps/cloud/.env.local automatically):
 *   bun scripts/seed-demo-kb.ts
 *   # staging/prod (env already exported by the deploy shell):
 *   SEED_KB_PDF=/path/to/book.pdf bun scripts/seed-demo-kb.ts
 *
 * Env:
 *   SEED_KB_PDF     path to the sample PDF (required if the default isn't present)
 *   SEED_EMAIL      owner email of the demo org (default owner@rantai.local) —
 *                   matches prisma/seed.ts so we attach to the same org
 *   SEED_KB_GROUP   KB group name (default "sdkelas3")
 *   SEED_KB_TITLE   document title
 *   KB_MISTRAL_OCR_KEY / KB_MINERU_API_KEY / KB_EXTRACT_MINERU_BASE_URL — OCR
 *   (embedding + storage come from the standard KB_* / S3_* env)
 */
import { readFileSync, existsSync } from "fs"

// Local convenience: if apps/cloud/.env.local exists and vars aren't already
// set (deploy shells export their own), load it. Never overrides real env.
const LOCAL_ENV = "/home/shiro/agents-cloud/apps/cloud/.env.local"
if (existsSync(LOCAL_ENV)) {
  for (const line of readFileSync(LOCAL_ENV, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!m) continue
    let [, k, v] = m
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (process.env[k] === undefined) process.env[k] = v
  }
}

const SEED_EMAIL = process.env.SUPERADMIN_EMAIL ?? process.env.SEED_EMAIL ?? "owner@rantai.local"
const GROUP_NAME = process.env.SEED_KB_GROUP ?? "sdkelas3"
const TITLE = process.env.SEED_KB_TITLE ?? "Pendidikan Agama Hindu dan Budi Pekerti untuk SD Kelas III"
const PDF =
  process.env.SEED_KB_PDF ??
  "/home/shiro/agents-cloud/contoh-data/Pendidikan_Agama_Hindu_dan_Budi_Pekerti_untuk_SD_Kelas_III.pdf"
// Prefer figures via the reliable hosted/managed OCR path.
if (!process.env.KB_LAYOUT_EXTRACTOR_ORDER) process.env.KB_LAYOUT_EXTRACTOR_ORDER = "sidecar,mistral,mineru-api"

async function main() {
  const { prisma } = await import("@/lib/prisma")

  // 1. Resolve the demo org from the seeded owner (same identity as prisma/seed.ts).
  const member = await prisma.organizationMember.findFirst({
    where: { userEmail: SEED_EMAIL },
    select: { organizationId: true, userId: true },
  })
  const orgId = member?.organizationId
  const userId = member?.userId ?? null
  if (!orgId) {
    console.error(`[seed-kb] no organization for ${SEED_EMAIL} — run the base seed first.`)
    process.exit(1)
  }

  // 2. Idempotent: skip if this org already has the doc in the group.
  const existing = await prisma.document.findFirst({
    where: { organizationId: orgId, title: TITLE, deletedAt: null },
    select: { id: true },
  })
  if (existing) {
    console.log(`[seed-kb] already seeded (doc ${existing.id}) — nothing to do.`)
    process.exit(0)
  }

  if (!existsSync(PDF)) {
    console.error(`[seed-kb] sample PDF not found at ${PDF}. Set SEED_KB_PDF.`)
    process.exit(1)
  }

  // 3. Reuse or create the KB group.
  let group = await prisma.knowledgeBaseGroup.findFirst({ where: { organizationId: orgId, name: GROUP_NAME } })
  if (!group) {
    group = await prisma.knowledgeBaseGroup.create({
      data: { name: GROUP_NAME, description: "Buku contoh — demo KB", color: "#137333", organizationId: orgId, createdBy: userId },
    })
  }

  // 4. Ingest through the real dashboard pipeline (forceOCR + enhanced).
  const { createKnowledgeDocumentForDashboard } = await import("@/features/knowledge/documents/service")
  const buf = readFileSync(PDF)
  const file = new File([new Uint8Array(buf)], `${GROUP_NAME}.pdf`, { type: "application/pdf" })
  console.log(`[seed-kb] ingesting ${(buf.length / 1024 / 1024).toFixed(1)} MB into org ${orgId}, group ${group.name}…`)

  const res = await createKnowledgeDocumentForDashboard({
    context: { organizationId: orgId, userId: userId ?? SEED_EMAIL, role: undefined },
    input: {
      kind: "file",
      file,
      title: TITLE,
      categories: ["Pendidikan Agama Hindu"],
      subcategory: "Kelas 3 SD",
      groupIds: [group.id],
      useEnhanced: true,
      useCombined: true,
      forceOCR: true,
    } as never,
  })
  console.log("[seed-kb] done:", JSON.stringify(res, (_k, v) => (typeof v === "string" && v.length > 80 ? v.slice(0, 80) + "…" : v)))
  await prisma.$disconnect()
  process.exit(0)
}

main().catch((e) => {
  console.error("[seed-kb] FAILED:", e)
  process.exit(1)
})
