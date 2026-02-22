import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"
import { parseSkillMarkdown } from "@/lib/skills/parser"

const CLAWHUB_API = "https://clawhub.ai/api/v1"

// POST /api/dashboard/skills/import-clawhub
// Body: { slug: string } — ClawHub skill slug (e.g. "self-improving-agent")
//    OR { rawContent: string } — Paste SKILL.md directly
export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const body = await req.json()

    const { slug, rawContent } = body

    let markdown: string
    let sourceUrl: string | null = null

    if (rawContent) {
      // Direct SKILL.md content pasted by user
      markdown = rawContent
    } else if (slug) {
      // Fetch SKILL.md from ClawHub file API
      sourceUrl = `https://clawhub.ai/skills/${slug}`

      const fileRes = await fetch(
        `${CLAWHUB_API}/skills/${encodeURIComponent(slug)}/file?path=SKILL.md`,
        { signal: AbortSignal.timeout(15000) }
      )

      if (!fileRes.ok) {
        return NextResponse.json(
          { error: `Failed to fetch SKILL.md from ClawHub: ${fileRes.status}` },
          { status: 400 }
        )
      }

      markdown = await fileRes.text()

      // Also fetch skill metadata for display name / summary if frontmatter is sparse
      try {
        const metaRes = await fetch(
          `${CLAWHUB_API}/skills/${encodeURIComponent(slug)}`,
          { signal: AbortSignal.timeout(5000) }
        )
        if (metaRes.ok) {
          const meta = await metaRes.json()
          const skill = meta.skill || meta
          // We'll use these as fallbacks when parsing
          if (skill.displayName && !markdown.includes("displayName:")) {
            markdown = markdown.replace(
              /^---\n/,
              `---\ndisplayName: "${skill.displayName}"\n`
            )
          }
          if (skill.summary && !markdown.includes("description:")) {
            markdown = markdown.replace(
              /^---\n/,
              `---\ndescription: "${skill.summary.substring(0, 200)}"\n`
            )
          }
        }
      } catch {
        // Metadata fetch failed, proceed with just SKILL.md
      }
    } else {
      return NextResponse.json(
        { error: "Either slug or rawContent is required" },
        { status: 400 }
      )
    }

    const parsed = parseSkillMarkdown(markdown)

    // Use slug as name if parser couldn't extract one
    const skillName = parsed.name || slug || "untitled"

    // Check for duplicate
    const existing = await prisma.skill.findFirst({
      where: {
        name: skillName,
        organizationId: orgContext?.organizationId || null,
      },
    })

    if (existing) {
      return NextResponse.json(
        { error: `Skill "${skillName}" already exists`, existingId: existing.id },
        { status: 409 }
      )
    }

    const skill = await prisma.skill.create({
      data: {
        name: skillName,
        displayName: parsed.displayName || skillName,
        description: parsed.description || "",
        content: parsed.content,
        source: "marketplace",
        sourceUrl,
        version: parsed.version,
        category: parsed.category,
        tags: parsed.tags,
        metadata: parsed.metadata as Record<string, string>,
        enabled: true,
        organizationId: orgContext?.organizationId || null,
        createdBy: session.user.id,
      },
    })

    return NextResponse.json(skill, { status: 201 })
  } catch (error) {
    console.error("[ClawHub Import] error:", error)
    return NextResponse.json({ error: "Failed to import skill" }, { status: 500 })
  }
}
