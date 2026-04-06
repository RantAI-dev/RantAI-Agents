import { prisma } from "@/lib/prisma"

const CLAWHUB_API_URL = process.env.CLAWHUB_API_URL || "https://clawhub.ai/api/v1"

export interface ClawHubSkill {
  slug: string
  name: string
  version: string
  description: string
  author: string
  content: string
  metadata?: Record<string, unknown>
  downloads?: number
  rating?: number
  installs?: number
}

// Raw shape returned by ClawHub /api/v1/skills
interface ClawHubListItem {
  slug: string
  displayName: string
  summary: string
  tags?: Record<string, string>
  stats?: { stars?: number; downloads?: number; installsCurrent?: number; installsAllTime?: number }
  latestVersion?: { version: string }
  metadata?: Record<string, unknown> | null
}

function mapListItem(item: ClawHubListItem): ClawHubSkill {
  return {
    slug: item.slug,
    name: item.displayName || item.slug,
    version: item.latestVersion?.version || "0.1.0",
    description: item.summary || "",
    author: "",
    content: "",
    metadata: item.metadata ?? undefined,
    downloads: item.stats?.downloads,
    rating: item.stats?.stars,
    installs: item.stats?.installsCurrent,
  }
}

/** Fetch all skills from ClawHub sorted by stars, with 5-minute cache */
export async function listClawHubSkills(): Promise<ClawHubSkill[]> {
  try {
    const res = await fetch(`${CLAWHUB_API_URL}/skills?sort=stars`, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(15000),
      next: { revalidate: 300 },
    })
    if (!res.ok) return []
    const data = await res.json()
    const items: ClawHubListItem[] = data.items || data.skills || data.results || []
    return items.map(mapListItem)
  } catch (error) {
    console.error("ClawHub list failed:", error)
    return []
  }
}

/** Search ClawHub skills — fetches full list and filters client-side (API has no search endpoint) */
export async function searchClawHub(query: string): Promise<ClawHubSkill[]> {
  const all = await listClawHubSkills()
  if (!query.trim()) return all
  const q = query.toLowerCase()
  return all.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.slug.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q)
  )
}

/** Fetch SKILL.md content for a skill via the file endpoint (with retry) */
async function fetchSkillContent(slug: string): Promise<string> {
  const encodedSlug = encodeURIComponent(slug)
  const url = `${CLAWHUB_API_URL}/skills/${encodedSlug}/file?path=SKILL.md`

  // Try up to 2 times (rate limits can cause transient failures)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 2000))
      const res = await fetch(url, {
        headers: { Accept: "text/markdown, text/plain, */*" },
        signal: AbortSignal.timeout(15000),
      })
      if (res.ok) {
        const text = await res.text()
        // Verify we got real content, not an error page
        if (text && text.length > 10 && !text.startsWith("Rate limit")) {
          return text
        }
      }
      // 429 = rate limited, retry
      if (res.status === 429 && attempt === 0) continue
    } catch {
      // timeout or network error
    }
  }
  return ""
}

export async function getClawHubSkill(slug: string): Promise<ClawHubSkill | null> {
  try {
    const encodedSlug = encodeURIComponent(slug)

    // Fetch skill metadata from single-skill endpoint
    const metaRes = await fetch(`${CLAWHUB_API_URL}/skills/${encodedSlug}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    })

    if (metaRes.ok) {
      const raw = await metaRes.json()
      const skill = raw.skill || raw
      const name = skill.displayName || skill.name || slug
      const description = skill.summary || skill.description || ""
      const version = raw.latestVersion?.version || skill.latestVersion?.version || skill.version || "0.1.0"

      // Fetch SKILL.md content (the metadata endpoint never includes it)
      const content = await fetchSkillContent(slug)

      return {
        slug: skill.slug || slug,
        name,
        version,
        description,
        author: skill.author || "",
        content,
        metadata: skill.metadata ?? {},
        downloads: skill.stats?.downloads ?? skill.downloads,
        rating: skill.stats?.stars ?? skill.rating,
        installs: skill.stats?.installsCurrent,
      }
    }

    // Fallback: find in the full listing, but still try to get content
    const all = await listClawHubSkills()
    const found = all.find((s) => s.slug === slug)
    if (found) {
      found.content = await fetchSkillContent(slug)
    }
    return found ?? null
  } catch (error) {
    console.error("ClawHub fetch failed:", error)
    return null
  }
}

export async function installClawHubSkill(
  employeeId: string,
  slug: string,
  installedBy: string
) {
  const skill = await getClawHubSkill(slug)
  if (!skill) throw new Error(`Skill not found on ClawHub: ${slug}`)

  return prisma.employeeInstalledSkill.upsert({
    where: { digitalEmployeeId_slug: { digitalEmployeeId: employeeId, slug } },
    create: {
      digitalEmployeeId: employeeId,
      slug: skill.slug,
      name: skill.name,
      version: skill.version,
      description: skill.description,
      content: skill.content,
      metadata: (skill.metadata || {}) as Record<string, string>,
      source: "clawhub",
      installedBy,
    },
    update: {
      version: skill.version,
      content: skill.content,
      metadata: (skill.metadata || {}) as Record<string, string>,
      updatedAt: new Date(),
    },
  })
}

export async function uninstallClawHubSkill(
  employeeId: string,
  slug: string
): Promise<void> {
  await prisma.employeeInstalledSkill.deleteMany({
    where: { digitalEmployeeId: employeeId, slug },
  })
}
