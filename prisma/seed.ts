import { PrismaClient } from "@prisma/client"
import { hash } from "bcryptjs"

const prisma = new PrismaClient()


// All built-in assistants — single source of truth for seeding
const BUILT_IN_ASSISTANTS = [
  {
    id: "general",
    name: "Just Chat",
    description: "General conversation assistant",
    emoji: "💬",
    systemPrompt: "You are a helpful assistant. Be concise, friendly, and informative.",
    model: "google/gemini-3-flash-preview",
    useKnowledgeBase: false,
    knowledgeBaseGroupIds: [],
    isSystemDefault: false,
    isBuiltIn: true,
    tags: ["Productivity"],
  },
  {
    id: "code-assistant",
    name: "Code Assistant",
    description: "Coding help, debugging, and code review",
    emoji: "👨‍💻",
    systemPrompt: `You are a skilled programming assistant. Help users write, debug, review, and explain code across any language or framework.

Guidelines:
- Write clean, well-structured code with clear variable names
- Explain your reasoning when debugging or reviewing
- Suggest best practices and potential improvements
- For substantial code (full files, components, scripts), create an artifact so users can see a live preview
- For short snippets or quick fixes, keep them inline in the chat`,
    model: "google/gemini-3-flash-preview",
    useKnowledgeBase: false,
    knowledgeBaseGroupIds: [],
    isSystemDefault: false,
    isBuiltIn: true,
    tags: ["Development"],
  },
  {
    id: "creative-writer",
    name: "Creative Writer",
    description: "Writing, storytelling, and content creation",
    emoji: "✍️",
    systemPrompt: `You are a creative writing assistant. Help users with storytelling, content creation, copywriting, and any form of written expression.

Guidelines:
- Adapt your tone and style to match the user's request (formal, casual, poetic, technical, etc.)
- Offer constructive suggestions to improve writing
- Help with brainstorming, outlines, drafts, and revisions
- For longer pieces (articles, stories, essays), create an artifact for easy reading and editing
- For quick edits or short suggestions, keep them inline`,
    model: "google/gemini-3-flash-preview",
    useKnowledgeBase: false,
    knowledgeBaseGroupIds: [],
    isSystemDefault: false,
    isBuiltIn: true,
    tags: ["Creative", "Marketing"],
  },
  {
    id: "data-analyst",
    name: "Data Analyst",
    description: "Data analysis, charts, and spreadsheets",
    emoji: "📊",
    systemPrompt: `You are a data analysis assistant. Help users understand data, create visualizations, build spreadsheets, and derive insights.

Guidelines:
- Present data clearly with tables, charts, or structured summaries
- Explain statistical concepts in accessible terms
- Help with data cleaning, transformation, and analysis approaches
- For charts, tables, or dashboards, create an artifact with a live preview
- For quick calculations or brief explanations, keep them inline`,
    model: "google/gemini-3-flash-preview",
    useKnowledgeBase: false,
    knowledgeBaseGroupIds: [],
    isSystemDefault: false,
    isBuiltIn: true,
    tags: ["Analytics"],
  },
  {
    id: "research-assistant",
    name: "Research Assistant",
    description: "Research, summarization, and fact-finding",
    emoji: "🔍",
    systemPrompt: `You are a research assistant. Help users find information, summarize topics, compare options, and organize knowledge.

Guidelines:
- Provide well-structured, factual responses with clear organization
- Use bullet points, headings, and tables for readability
- Distinguish between established facts and your analysis
- If you have web search available, use it for current information
- For comprehensive reports or comparisons, create an artifact document
- For quick answers or short summaries, keep them inline`,
    model: "google/gemini-3-flash-preview",
    useKnowledgeBase: false,
    knowledgeBaseGroupIds: [],
    isSystemDefault: false,
    isBuiltIn: true,
    tags: ["Research", "RAG"],
  },
]

async function seedAssistants() {
  console.log("\n[Assistants]")

  for (const assistant of BUILT_IN_ASSISTANTS) {
    const existing = await prisma.assistant.findUnique({ where: { id: assistant.id } })
    if (existing) {
      // Update tags and other fields that may have changed
      await prisma.assistant.update({
        where: { id: assistant.id },
        data: { tags: assistant.tags ?? [] },
      })
      console.log(`  ~ ${assistant.name} (${assistant.id}) — updated tags`)
    } else {
      await prisma.assistant.create({ data: assistant })
      console.log(`  ${assistant.isSystemDefault ? "★" : "+"} ${assistant.name} (${assistant.id})`)
    }
  }

  console.log(`  Total: ${BUILT_IN_ASSISTANTS.length} built-in assistants`)
}


async function forceReseedCleanup() {
  if (process.env.FORCE_RESEED !== "true") return

  console.log("[FORCE_RESEED] Clearing memory + assistants...")

  // Clear memory tables (working + long-term memory)
  const deletedMemories = await prisma.userMemory.deleteMany()
  console.log(`  - Cleared ${deletedMemories.count} memory records`)

  // Delete built-in assistants so they get recreated with latest prompts
  const deletedAssistants = await prisma.assistant.deleteMany({
    where: { isBuiltIn: true },
  })
  console.log(`  - Cleared ${deletedAssistants.count} built-in assistants (will be recreated)`)
}

async function seedCatalogItems() {
  console.log("\n--- Seeding Marketplace Catalog (Community) ---")

  // Remove old non-community catalog items (legacy static catalog)
  // Preserve MCP catalog items (seeded by scripts/seed-mcp.ts)
  const deleted = await prisma.catalogItem.deleteMany({
    where: {
      communitySkillName: null,
      communityToolName: null,
      type: { not: "mcp" },
    },
  })
  if (deleted.count > 0) {
    console.log(`  Removed ${deleted.count} legacy catalog items`)
  }

  // Seed from community-skills package
  let pkg: { tools?: Record<string, unknown>; skills?: Record<string, unknown> }
  try {
    pkg = await import("@rantai/community-skills")
  } catch {
    console.warn("  @rantai/community-skills not installed, skipping marketplace seed")
    return
  }

  const TOOL_ICONS: Record<string, string> = {
    yahoo_finance_quote: "💹",
    yahoo_finance_search: "🔎",
    weather_lookup: "🌦️",
    qr_code_generator: "📱",
    url_metadata_extract: "🔗",
    crypto_price: "🪙",
    crypto_search: "🔍",
    wikipedia_search: "📚",
    dictionary_lookup: "📖",
  }

  const tools = pkg.tools ?? {}
  const skills = pkg.skills ?? {}
  let count = 0

  for (const [name, toolDef] of Object.entries(tools)) {
    const def = toolDef as { name: string; displayName: string; description: string; tags?: string[] }
    const toolIcon = TOOL_ICONS[def.name] || "🔧"
    await prisma.catalogItem.upsert({
      where: { name: `community-tool-${name}` },
      update: { displayName: def.displayName, description: def.description, icon: toolIcon, tags: def.tags ?? [] },
      create: {
        name: `community-tool-${name}`,
        displayName: def.displayName,
        description: def.description,
        category: "Community",
        type: "tool",
        icon: toolIcon,
        tags: def.tags ?? [],
        communityToolName: name,
      },
    })
    count++
  }

  for (const [name, skillDef] of Object.entries(skills)) {
    const def = skillDef as { name: string; displayName: string; description: string; category: string; tags: string[]; icon?: string; configSchema?: unknown }
    await prisma.catalogItem.upsert({
      where: { name: `community-skill-${name}` },
      update: { displayName: def.displayName, description: def.description, icon: def.icon || "✨", tags: def.tags },
      create: {
        name: `community-skill-${name}`,
        displayName: def.displayName,
        description: def.description,
        category: def.category,
        type: "skill",
        icon: def.icon || "Sparkles",
        tags: def.tags,
        communitySkillName: name,
        configSchema: def.configSchema ? JSON.parse(JSON.stringify(def.configSchema)) : undefined,
      },
    })
    count++
  }

  console.log(`  Seeded ${count} community catalog items (${Object.keys(tools).length} tools + ${Object.keys(skills).length} skills)`)
}

async function seedAssistantToolBindings() {
  const assistantIds = BUILT_IN_ASSISTANTS.map((assistant) => assistant.id)
  const tools = await prisma.tool.findMany({
    where: {
      isBuiltIn: true,
      organizationId: null,
      enabled: true,
    },
    select: {
      id: true,
    },
  })

  if (assistantIds.length === 0 || tools.length === 0) {
    console.log("\n[Assistant Tool Bindings]\n  ! Skipped (no assistants/tools found)")
    return
  }

  await prisma.$transaction(async (tx) => {
    for (const assistantId of assistantIds) {
      const existingCount = await tx.assistantTool.count({
        where: { assistantId },
      })
      if (existingCount > 0) {
        continue
      }

      await tx.assistantTool.createMany({
        data: tools.map((tool) => ({
          assistantId,
          toolId: tool.id,
          enabled: false,
        })),
        skipDuplicates: true,
      })
    }
  })

  console.log(
    `\n[Assistant Tool Bindings]\n  ✓ Ensured ${tools.length} tools are available for ${assistantIds.length} assistants (defaults preserved)`
  )
}

async function seedPlatformSkills() {
  let pkg: { skills?: Record<string, unknown> }
  try {
    pkg = await import("@rantai/community-skills")
  } catch {
    console.warn(
      "\n[Skills]\n  ! @rantai/community-skills not installed, skipping skill + binding seed"
    )
    return
  }

  const skillDefs = pkg.skills ?? {}
  let seededCount = 0

  for (const [name, skillDef] of Object.entries(skillDefs)) {
    const def = skillDef as {
      name?: string
      displayName?: string
      description?: string
      skillPrompt?: string
      category?: string
      tags?: string[]
      icon?: string
      version?: string
      sharedTools?: string[]
    }

    const normalizedName = def.name || name
    const existing = await prisma.skill.findFirst({
      where: { name: normalizedName, organizationId: null },
      select: { id: true },
    })

    const data = {
      displayName: def.displayName || normalizedName,
      description: def.description || "Community skill",
      content: def.skillPrompt || "",
      source: "marketplace",
      version: def.version || "1.0.0",
      category: (def.category || "general").toLowerCase(),
      tags: def.tags || [],
      icon: def.icon || "✨",
      metadata: {
        source: "community-skills",
        sharedTools: def.sharedTools || [],
      },
      enabled: true,
    } as const

    if (existing) {
      await prisma.skill.update({
        where: { id: existing.id },
        data,
      })
      seededCount++
    } else {
      await prisma.skill.create({
        data: {
          name: normalizedName,
          organizationId: null,
          ...data,
        },
      })
      seededCount++
    }
  }

  console.log(`\n[Skills]\n  ✓ Seeded ${seededCount} platform skills`)
}

async function main() {
  console.log("\n🌱 RantAI Agents — Database Seed\n")

  // Ensure S3 bucket exists (safe to call repeatedly — no-op if already exists)
  try {
    const { ensureBucket } = await import("../src/lib/s3")
    await ensureBucket()
  } catch (e) {
    console.warn("  [S3] Could not ensure bucket (SeaweedFS may not be ready):", e instanceof Error ? e.message : e)
  }

  // FORCE_RESEED: clean up memory + assistants BEFORE seeding
  await forceReseedCleanup()

  // Create test users
  const passwordHash = await hash("password123", 12)

  const user1 = await prisma.user.upsert({
    where: { email: "agent@rantai.com" },
    update: { role: "ADMIN" },
    create: {
      email: "agent@rantai.com",
      name: "Sarah Johnson",
      passwordHash,
      status: "OFFLINE",
      role: "ADMIN",
    },
  })

  const user2 = await prisma.user.upsert({
    where: { email: "admin@rantai.com" },
    update: { role: "ADMIN" },
    create: {
      email: "admin@rantai.com",
      name: "Michael Chen",
      passwordHash,
      status: "OFFLINE",
      role: "ADMIN",
    },
  })

  console.log("[Users]")
  console.log(`  ${user1.name} (${user1.email}) — ${user1.role}`)
  console.log(`  ${user2.name} (${user2.email}) — ${user2.role}`)

  // Seed Built-in Assistants
  await seedAssistants()


  // Seed Built-in Tools
  const { ensureBuiltinTools } = await import("../src/lib/tools/seed")
  const { BUILTIN_TOOLS } = await import("../src/lib/tools/builtin")
  await ensureBuiltinTools()
  console.log(`\n[Tools]\n  ✓ ${Object.keys(BUILTIN_TOOLS).length} built-in tools upserted`)
  await seedAssistantToolBindings()
  await seedPlatformSkills()

  // Seed Marketplace Catalog
  await seedCatalogItems()


  // Seed default Feature Configurations
  console.log("\n[Feature Configuration]")
  const defaultFeatures = [
    { feature: "AGENT", enabled: true },
  ]
  for (const feat of defaultFeatures) {
    await prisma.featureConfig.upsert({
      where: { feature: feat.feature },
      update: {},
      create: { feature: feat.feature, enabled: feat.enabled, config: {} },
    })
    console.log(`  ✓ ${feat.feature} (enabled: ${feat.enabled})`)
  }

  console.log("\n✅ Seed complete!")
  console.log(`  Users:      2 (agent / admin @rantai.com)`)
  console.log(`  Assistants: ${BUILT_IN_ASSISTANTS.length} built-in`)
  console.log(`  Tools:      ${Object.keys(BUILTIN_TOOLS).length} built-in`)
  console.log(`\n  Login: agent@rantai.com / password123`)
  console.log(`  Start: bun run dev → http://localhost:3000\n`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    // Close SurrealDB connection to prevent process hanging
    try {
      const { SurrealDBClient: SDB } = await import("../src/lib/surrealdb/client")
      await SDB.resetInstance()
    } catch {
      // ignore
    }
    process.exit(0)
  })
