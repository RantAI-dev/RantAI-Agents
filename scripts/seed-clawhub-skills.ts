/**
 * Seed curated behavior/knowledge skills from ClawHub into CatalogItem table.
 * Skips execution-layer skills (CLI-dependent).
 *
 * Run: npx tsx scripts/seed-clawhub-skills.ts
 * Options:
 *   --max-pages=N   Max pages to fetch (default: 5, each page = 20 skills)
 *   --dry-run       Don't write to DB, just show what would be imported
 */
import { PrismaClient } from "@prisma/client"
import matter from "gray-matter"

const prisma = new PrismaClient()
const CLAWHUB_API = "https://clawhub.ai/api/v1"
const LIMIT = 20
const FETCH_DELAY_MS = 300

// Parse CLI args
const args = process.argv.slice(2)
const maxPages = Number(args.find((a) => a.startsWith("--max-pages="))?.split("=")[1]) || 5
const dryRun = args.includes("--dry-run")

interface ClawHubListItem {
  slug: string
  displayName: string
  summary: string
  tags: Record<string, string>
  stats: { downloads: number; stars: number }
  latestVersion: { version: string } | null
}

// Known CLI binaries that indicate execution-layer skills
const KNOWN_BINS = new Set([
  "gog", "gh", "jira", "slack", "notion", "linear", "vercel",
  "aws", "gcloud", "az", "kubectl", "docker", "terraform",
  "curl", "wget", "ffmpeg", "pandoc",
])

function classifyLayer(content: string): "behavior" | "knowledge" | "execution" {
  // Check fenced code blocks for CLI commands
  const fencedPattern = /```(?:bash|sh|shell)?\n([\s\S]*?)```/g
  let match: RegExpExecArray | null
  while ((match = fencedPattern.exec(content)) !== null) {
    for (const line of match[1].split("\n")) {
      const cmd = line.replace(/^\$?\s*/, "").trim().split(/\s+/)[0]
      if (cmd && KNOWN_BINS.has(cmd)) return "execution"
    }
  }

  // Check inline code for CLI usage
  const inlinePattern = /`([a-z][a-z0-9_-]*)\s+[^`]+`/g
  while ((match = inlinePattern.exec(content)) !== null) {
    if (KNOWN_BINS.has(match[1])) return "execution"
  }

  // Check for env var references (strong indicator of execution)
  if (/\$\{?[A-Z][A-Z0-9_]{3,}\}?/.test(content)) return "execution"

  // Check for API endpoint patterns (execution)
  if (/https?:\/\/api\.\S+/.test(content) && /\bcurl\b|\bfetch\b|\brequest\b/i.test(content)) {
    return "execution"
  }

  return "behavior"
}

function inferCategory(content: string, summary: string): string {
  const text = `${content} ${summary}`.toLowerCase()
  if (/\b(code|programming|debug|refactor|typescript|javascript|python|rust)\b/.test(text)) return "Development"
  if (/\b(write|writing|blog|content|copy|seo|documentation)\b/.test(text)) return "AI & Writing"
  if (/\b(customer|support|ticket|helpdesk)\b/.test(text)) return "Customer Support"
  if (/\b(data|analytics|chart|visualization|statistics)\b/.test(text)) return "Data"
  if (/\b(email|slack|discord|communication|message)\b/.test(text)) return "Communication"
  if (/\b(task|productivity|planning|schedule|project)\b/.test(text)) return "Productivity"
  return "Community"
}

async function fetchSkillContent(slug: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${CLAWHUB_API}/skills/${encodeURIComponent(slug)}/file?path=SKILL.md`,
      { signal: AbortSignal.timeout(15000) }
    )
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  console.log("=== Seed ClawHub Skills into CatalogItem ===")
  console.log(`Config: max ${maxPages} pages, ${dryRun ? "DRY RUN" : "LIVE"}\n`)

  let cursor: string | null = null
  let totalImported = 0
  let totalSkipped = 0
  let totalExecution = 0

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({ sort: "downloads", limit: String(LIMIT) })
    if (cursor) params.set("cursor", cursor)

    console.log(`--- Page ${page + 1} ---`)

    const res = await fetch(`${CLAWHUB_API}/skills?${params}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) {
      console.error(`ClawHub returned ${res.status}, stopping.`)
      break
    }

    const data = await res.json()
    const items: ClawHubListItem[] = data.items || []
    if (items.length === 0) {
      console.log("No more items.")
      break
    }

    for (const item of items) {
      // Skip if already exists
      const existing = await prisma.catalogItem.findUnique({
        where: { sourceSlug: item.slug },
      })
      if (existing) {
        totalSkipped++
        continue
      }

      // Also check name collision
      const nameExists = await prisma.catalogItem.findUnique({
        where: { name: item.slug },
      })
      if (nameExists) {
        totalSkipped++
        continue
      }

      // Fetch SKILL.md
      const markdown = await fetchSkillContent(item.slug)
      if (!markdown) {
        console.log(`  Skip ${item.slug}: no SKILL.md`)
        totalSkipped++
        await sleep(FETCH_DELAY_MS)
        continue
      }

      // Parse
      const { data: fm, content } = matter(markdown)

      // Classify
      const layer = classifyLayer(content)
      if (layer === "execution") {
        console.log(`  Skip ${item.slug}: execution-layer`)
        totalExecution++
        totalSkipped++
        await sleep(FETCH_DELAY_MS)
        continue
      }

      const displayName = item.displayName || (fm.displayName as string) || item.slug
      const description = item.summary || (fm.description as string) || ""
      const category = inferCategory(content, description)
      const tags = Array.isArray(fm.tags) ? fm.tags.map(String) : []

      if (dryRun) {
        console.log(`  [DRY] Would import: ${displayName} (${item.slug}) [${category}]`)
      } else {
        await prisma.catalogItem.create({
          data: {
            name: item.slug,
            displayName,
            description: description.substring(0, 500),
            category,
            type: "skill",
            icon: "Sparkles",
            tags,
            featured: false,
            skillContent: content.trim(),
            skillCategory: (fm.category as string) || category.toLowerCase(),
            sourceUrl: `https://clawhub.ai/skills/${item.slug}`,
            sourceSlug: item.slug,
          },
        })
        console.log(`  Imported: ${displayName} [${category}]`)
      }

      totalImported++
      await sleep(FETCH_DELAY_MS)
    }

    cursor = data.nextCursor || null
    if (!cursor) {
      console.log("No more pages.")
      break
    }
  }

  console.log(`\n=== Summary ===`)
  console.log(`Imported: ${totalImported}`)
  console.log(`Skipped: ${totalSkipped} (${totalExecution} execution-layer)`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
