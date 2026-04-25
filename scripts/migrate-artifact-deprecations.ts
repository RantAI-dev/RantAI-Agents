/**
 * Migration: handle artifact-system deprecations from the 2026-04-25 audit.
 *
 * Two independent passes (each idempotent, run in any order):
 *
 *   1. SLIDES `image-text` → `content`
 *      - replaces deprecated layout with its functional equivalent in stored
 *        application/slides artifacts so the future hard-error gate (created
 *        with isNew=true in validateSlides) doesn't lock authors out on edit
 *      - safe: renderer + PPTX exporter already treat both layouts identically
 *
 *   2. MARKDOWN audit (report-only)
 *      - counts text/markdown artifacts that contain a <script> tag and / or
 *        exceed the 128KB cap that ARTIFACT_STRICT_MARKDOWN_VALIDATION will
 *        enforce on creates. No mutation — produces a list for the team to
 *        decide what to do (notify owners, programmatically strip, leave).
 *
 * Usage:
 *   bun run scripts/migrate-artifact-deprecations.ts            # apply slides + audit markdown
 *   bun run scripts/migrate-artifact-deprecations.ts --dry-run  # preview only, no writes
 *   bun run scripts/migrate-artifact-deprecations.ts --slides   # slides pass only
 *   bun run scripts/migrate-artifact-deprecations.ts --markdown # markdown audit only
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const args = new Set(process.argv.slice(2))
const dryRun = args.has("--dry-run")
const onlySlides = args.has("--slides")
const onlyMarkdown = args.has("--markdown")
const runSlides = !onlyMarkdown
const runMarkdown = !onlySlides

const MARKDOWN_CAP_BYTES = 128 * 1024

interface SlideStats {
  scanned: number
  artifactsAffected: number
  slidesRewritten: number
  failed: number
}

interface MarkdownStats {
  scanned: number
  withScript: number
  oversized: number
  oversizedAndScript: number
}

async function migrateSlides(): Promise<SlideStats> {
  const stats: SlideStats = { scanned: 0, artifactsAffected: 0, slidesRewritten: 0, failed: 0 }

  const artifacts = await prisma.document.findMany({
    where: { artifactType: "application/slides" },
    select: { id: true, title: true, content: true, sessionId: true },
  })
  stats.scanned = artifacts.length

  for (const a of artifacts) {
    let parsed: unknown
    try {
      parsed = JSON.parse(a.content)
    } catch {
      // legacy markdown deck — skip (no `image-text` semantics there)
      continue
    }
    if (!parsed || typeof parsed !== "object") continue
    const deck = parsed as { slides?: Array<{ layout?: string }> }
    if (!Array.isArray(deck.slides)) continue

    let rewritten = 0
    for (const slide of deck.slides) {
      if (slide && slide.layout === "image-text") {
        slide.layout = "content"
        rewritten++
      }
    }
    if (rewritten === 0) continue

    stats.artifactsAffected++
    stats.slidesRewritten += rewritten
    console.log(
      `  ${dryRun ? "[would update]" : "[update]"} ${a.id} (${a.title}) — ${rewritten} slide(s) rewritten`,
    )
    if (!dryRun) {
      try {
        await prisma.document.update({
          where: { id: a.id },
          data: { content: JSON.stringify(deck) },
        })
      } catch (err) {
        console.error(`    failed: ${(err as Error).message}`)
        stats.failed++
      }
    }
  }

  return stats
}

async function auditMarkdown(): Promise<MarkdownStats> {
  const stats: MarkdownStats = {
    scanned: 0,
    withScript: 0,
    oversized: 0,
    oversizedAndScript: 0,
  }

  const artifacts = await prisma.document.findMany({
    where: { artifactType: "text/markdown" },
    select: { id: true, title: true, content: true, sessionId: true, organizationId: true },
  })
  stats.scanned = artifacts.length

  for (const a of artifacts) {
    const hasScript = /<script[\s>]/i.test(a.content)
    const bytes = Buffer.byteLength(a.content, "utf-8")
    const oversized = bytes > MARKDOWN_CAP_BYTES
    if (hasScript) stats.withScript++
    if (oversized) stats.oversized++
    if (hasScript && oversized) stats.oversizedAndScript++

    if (hasScript || oversized) {
      const flags = [
        hasScript ? "<script>" : null,
        oversized ? `${Math.round(bytes / 1024)}KB` : null,
      ]
        .filter(Boolean)
        .join(" + ")
      console.log(
        `  ${a.id} (${a.title}) [org=${a.organizationId ?? "global"} session=${a.sessionId ?? "—"}] — ${flags}`,
      )
    }
  }

  return stats
}

async function main() {
  console.log(
    `\n=== artifact deprecations migration ${dryRun ? "(DRY RUN)" : ""} ===\n`,
  )

  if (runSlides) {
    console.log("--- SLIDES pass: image-text → content ---")
    const s = await migrateSlides()
    console.log(
      `\nSlides scanned: ${s.scanned} | artifacts affected: ${s.artifactsAffected} | slides rewritten: ${s.slidesRewritten} | failed: ${s.failed}\n`,
    )
  }

  if (runMarkdown) {
    console.log("--- MARKDOWN audit: <script> tags + >128KB content (report-only) ---")
    const m = await auditMarkdown()
    console.log(
      `\nMarkdown scanned: ${m.scanned} | with <script>: ${m.withScript} | >128KB: ${m.oversized} | both: ${m.oversizedAndScript}\n`,
    )
    if (m.withScript > 0 || m.oversized > 0) {
      console.log(
        "Next steps:\n" +
          "  • Decide per artifact: notify owner, programmatically strip <script>, or accept (warning still fires).\n" +
          "  • Once <script> incidents are addressed, set ARTIFACT_STRICT_MARKDOWN_VALIDATION=true to flip the soft warning into a hard error on the LLM tool path.\n" +
          "  • The 128KB cap on isNew applies regardless of the env flag — affected artifacts can still be edited (existing rows are grandfathered) but future creates will be rejected.\n",
      )
    }
  }

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error("Migration failed:", err)
  void prisma.$disconnect()
  process.exit(1)
})
