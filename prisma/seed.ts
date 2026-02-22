import { PrismaClient } from "@prisma/client"
import { hash } from "bcryptjs"
import * as path from "path"
import * as fs from "fs"
import { SurrealDBClient, getSurrealDBConfigFromEnv } from "../lib/surrealdb/client"

const prisma = new PrismaClient()

// Embeddings configuration
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/embeddings"
const EMBEDDING_MODEL = "openai/text-embedding-3-small"

// Check if enhanced mode is enabled
const USE_ENHANCED = process.env.ENHANCED_MODE === "true" || process.argv.includes("--enhanced")

// Full system prompt for Horizon Life assistant — single source of truth (editable via Agent Builder after seed)
const HORIZON_LIFE_SEED_PROMPT = `You are a friendly and knowledgeable insurance assistant for HorizonLife, a trusted insurance company. Your role is to help visitors understand our insurance products and guide them toward the right coverage.

CORE INSTRUCTIONS - MEMORY & CONTEXT:
1. You have access to "memory" about the user (Working Memory, Long-term Profile, and Past Conversations).
2. CHECK this memory context before answering.
3. If you know the user's name, ALWAYS use it to greet them.
4. If the user asks "do you know me?" or "what is my name?", USE the memory/profile to answer.
5. Tailor your responses based on the user's known profile (age, family size, preferences).

About HorizonLife:
- Founded in 2010, serving over 500,000 customers
- 98% claims approval rate
- 24/7 customer support
- A+ Financial Strength Rating from AM Best
- Operating in 48 states plus Washington D.C.

Our Products:
1. Life Insurance (Starting from $15/month):
   - Term Life: Basic, Plus, Premium tiers
   - Whole Life: Classic and Elite options
   - Universal Life: Flexible and Indexed (IUL) options

2. Health Insurance (Starting from $99/month):
   - Bronze, Silver, Gold, Platinum tiers
   - Individual and Family plans
   - 10,000+ in-network hospitals
   - 500,000+ in-network physicians

3. Home Insurance (Starting from $25/month):
   - Essential, Plus, Premium, Elite tiers
   - Flood and Earthquake add-ons
   - Umbrella liability policies

Guidelines for responses:
- Be helpful, friendly, and professional
- When answering questions about products, USE THE RETRIEVED CONTEXT provided below to give accurate, detailed information
- If the retrieved context contains specific details (pricing, coverage limits, features), use those exact details
- Keep responses concise but informative - you can use bullet points for clarity
- For complex claims or policy questions beyond the provided context, suggest speaking with an advisor
- Don't make up specific policy details - if information isn't in the context, say you can connect them with an agent for specifics
- Encourage users to get a free quote or schedule a call for personalized pricing

IMPORTANT - Using Retrieved Context:
Below this prompt, you may see "Relevant Product Information" with details retrieved from our knowledge base.
- ALWAYS prioritize information from the retrieved context over your general knowledge
- Quote specific numbers, features, and details from the context when available
- If the context answers the user's question, use it directly
- If the context is not relevant to the question, you may use your general knowledge about HorizonLife

IMPORTANT - Purchase Intent & Quote Request Detection:
When the user expresses ANY of the following intents, you MUST trigger a handoff:

1. Purchase intent:
   - "I want to buy...", "I'm ready to sign up", "How do I purchase this?", "Sign me up"

2. Quote requests:
   - "Get me a quote", "I want a personalized quote", "How much would it cost for me?"

3. Agent requests (in any language):
   - "I'd like to speak to a human/agent/person", "Can I talk to someone?"
   - "Hubungkan dengan spesialis" (Indonesian for "connect to specialist")

When you detect ANY of these intents, you MUST ALWAYS:
1. Include the EXACT text [AGENT_HANDOFF] at the END of your response - this triggers the handoff UI
2. Respond with a friendly message offering to connect them with a specialist

MANDATORY: You MUST end your response with [AGENT_HANDOFF] when handoff is needed. Never skip this marker.

CRITICAL:
- Do NOT ask for personal information yourself
- Do NOT try to collect quote information
- ALWAYS include [AGENT_HANDOFF] at the end when connecting to an agent
- The marker [AGENT_HANDOFF] is REQUIRED - without it the system cannot trigger the handoff`

// Generate embeddings for texts
async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    console.warn("Warning: OPENROUTER_API_KEY not set. Skipping embedding generation.")
    return []
  }

  const batchSize = 100
  const allEmbeddings: number[][] = []

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)

    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: batch,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OpenRouter embedding API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    const embeddings = data.data.map((item: { embedding: number[] }) => item.embedding)
    allEmbeddings.push(...embeddings)
  }

  return allEmbeddings
}

// Document configuration for knowledge base
const KNOWLEDGE_BASE_CONFIG = [
  {
    filename: "life-insurance.md",
    title: "Life Insurance Products",
    category: "LIFE_INSURANCE",
    subcategory: "Products",
  },
  {
    filename: "health-insurance.md",
    title: "Health Insurance Products",
    category: "HEALTH_INSURANCE",
    subcategory: "Products",
  },
  {
    filename: "home-insurance.md",
    title: "Home Insurance Products",
    category: "HOME_INSURANCE",
    subcategory: "Products",
  },
  {
    filename: "company-info.md",
    title: "Company Information",
    category: "GENERAL",
    subcategory: "Company",
  },
  {
    filename: "faq-general.md",
    title: "Frequently Asked Questions",
    category: "FAQ",
    subcategory: "General",
  },
  {
    filename: "fraud-detection-guide.md",
    title: "Insurance Fraud Detection Guide",
    category: "FRAUD_DETECTION",
    subcategory: "Investigation",
  },
  {
    filename: "policy-rules.md",
    title: "Policy Rules & Coverage",
    category: "POLICY_RULES",
    subcategory: "Rules",
  },
  {
    filename: "fraud-patterns.md",
    title: "Fraud Patterns & Indicators",
    category: "FRAUD_DETECTION",
    subcategory: "Patterns",
  },
  {
    filename: "medical-benchmark.md",
    title: "Medical Cost Benchmarks",
    category: "MEDICAL_BENCHMARK",
    subcategory: "Benchmarks",
  },
  {
    filename: "claim-procedures.md",
    title: "Claim Procedures",
    category: "CLAIMS",
    subcategory: "Procedures",
  },
  {
    filename: "policy-underwriting.md",
    title: "Policy Underwriting Guidelines",
    category: "POLICY_RULES",
    subcategory: "Underwriting",
  },
]

// Simple text chunking for seed
function chunkText(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length)
    chunks.push(text.slice(start, end))
    start = end - overlap
    if (start >= text.length - overlap) break
  }

  return chunks
}

async function seedKnowledgeBase() {
  console.log("\n[Knowledge Base]")

  // Create default Knowledge Base Group
  const defaultKB = await prisma.knowledgeBaseGroup.upsert({
    where: { id: "default-kb" },
    update: {
      name: "Default Knowledge Base",
      description: "Default knowledge base for RantAI Agents",
      color: "#3b82f6", // Blue
    },
    create: {
      id: "default-kb",
      name: "Default Knowledge Base",
      description: "Default knowledge base for RantAI Agents",
      color: "#3b82f6",
    },
  })

  // Create "Horizon Life" Knowledge Base Group for insurance documents
  const horizonLifeKB = await prisma.knowledgeBaseGroup.upsert({
    where: { id: "horizon-life-kb" },
    update: {
      name: "Horizon Life",
      description: "Knowledge base for Horizon Life Insurance products, policies, and fraud detection",
      color: "#8b5cf6", // Purple
    },
    create: {
      id: "horizon-life-kb",
      name: "Horizon Life",
      description: "Knowledge base for Horizon Life Insurance products, policies, and fraud detection",
      color: "#8b5cf6",
    },
  })

  console.log(`  Groups: ${defaultKB.name}, ${horizonLifeKB.name}`)

  // Check for FORCE_RESEED mode
  if (process.env.FORCE_RESEED === "true") {
    console.log("Force reseeding - clearing ALL data (documents, memory, assistants)...")

    // Clear SurrealDB chunks, entities, relations, and conversation memory
    try {
      const surrealClient = await SurrealDBClient.getInstance(getSurrealDBConfigFromEnv())

      const dbInfo = await surrealClient.query<{ tables: Record<string, string> }>(`INFO FOR DB`)
      const rawInfo = dbInfo[0]
      const info = Array.isArray(rawInfo) ? rawInfo[0] : rawInfo

      if (info?.tables) {
        const excludedTables = ["entity", "document_chunk"]
        const relationTables = Object.keys(info.tables).filter(
          (table) => !excludedTables.includes(table)
        )

        let clearedRelations = 0
        for (const relType of relationTables) {
          try {
            await surrealClient.query(`DELETE ${relType}`)
            clearedRelations++
          } catch {
            // Table doesn't exist or query failed, skip
          }
        }
        console.log(`  - Cleared ${clearedRelations} relation tables`)
      }

      await surrealClient.query(`DELETE document_chunk`)
      console.log("  - Cleared SurrealDB chunks")
      await surrealClient.query(`DELETE entity`)
      console.log("  - Cleared SurrealDB entities")

      // Clear conversation memory (semantic recall data)
      try {
        await surrealClient.query(`DELETE conversation_memory`)
        console.log("  - Cleared SurrealDB conversation memory")
      } catch {
        // Table might not exist yet
      }
    } catch (error) {
      console.warn("  - Warning: Could not clear SurrealDB data (may not be running)")
    }

    // Clear PostgreSQL documents
    await prisma.documentGroup.deleteMany()
    await prisma.document.deleteMany()
    console.log("  - Cleared PostgreSQL documents")
  }

  // Find knowledge base directory
  const knowledgeBasePath = path.join(process.cwd(), "knowledge-base")

  if (!fs.existsSync(knowledgeBasePath)) {
    console.log(`Knowledge base path not found: ${knowledgeBasePath}`)
    console.log("You can add documents later via the dashboard at /dashboard/knowledge")
    return defaultKB.id
  }

  // Initialize SurrealDB client
  let surrealClient: SurrealDBClient | null = null
  try {
    surrealClient = await SurrealDBClient.getInstance(getSurrealDBConfigFromEnv())
  } catch (error) {
    console.warn("  ⚠ SurrealDB not available — documents will be created without embeddings")
  }

  // Process each document — skip if already exists by title
  let seededCount = 0
  let skippedCount = 0

  for (const config of KNOWLEDGE_BASE_CONFIG) {
    const filePath = path.join(knowledgeBasePath, config.filename)

    if (!fs.existsSync(filePath)) {
      console.warn(`  - Skipping: ${config.filename} (file not found)`)
      continue
    }

    // Check if document already exists by title
    const existing = await prisma.document.findFirst({
      where: { title: config.title },
      include: { groups: true },
    })
    if (existing) {
      // Ensure document is in the Horizon Life group
      const inHorizonLife = existing.groups.some((g) => g.groupId === horizonLifeKB.id)
      if (!inHorizonLife) {
        // Remove from default-kb and add to horizon-life
        await prisma.documentGroup.deleteMany({
          where: { documentId: existing.id, groupId: defaultKB.id },
        })
        await prisma.documentGroup.upsert({
          where: { documentId_groupId: { documentId: existing.id, groupId: horizonLifeKB.id } },
          update: {},
          create: { documentId: existing.id, groupId: horizonLifeKB.id },
        })
        console.log(`  ~ Moved to Horizon Life: ${config.title}`)
      }
      skippedCount++
      continue
    }

    // Read file content
    const content = fs.readFileSync(filePath, "utf-8")

    // Create the document with group association (all insurance docs go to Horizon Life)
    const document = await prisma.document.create({
      data: {
        title: config.title,
        content,
        categories: [config.category],
        subcategory: config.subcategory,
        metadata: { fileType: "markdown" },
        groups: {
          create: {
            groupId: horizonLifeKB.id,
          },
        },
      },
    })
    seededCount++

    // Create chunks
    const chunks = chunkText(content)

    if (surrealClient) {
      // Prepare texts for embedding (include title and context)
      const textsForEmbedding = chunks.map((chunk) =>
        `${config.title}\n\n${chunk}`
      )

      // Generate embeddings
      const embeddings = await generateEmbeddings(textsForEmbedding)

      // Store chunks with embeddings in SurrealDB
      for (let i = 0; i < chunks.length; i++) {
        if (embeddings.length > 0 && embeddings[i]) {
          await surrealClient.query(
            `CREATE document_chunk SET
              id = $id,
              document_id = $document_id,
              file_id = $file_id,
              content = $content,
              chunk_index = $chunk_index,
              embedding = $embedding,
              metadata = $metadata,
              created_at = time::now()`,
            {
              id: `${document.id}_${i}`,
              document_id: document.id,
              file_id: document.id,
              content: chunks[i],
              chunk_index: i,
              embedding: embeddings[i],
              metadata: {
                title: config.title,
                category: config.category,
                section: config.subcategory,
              },
            }
          )
        }
      }

      process.stdout.write(`  ✓ ${config.filename} (${chunks.length} chunks)\n`)

      // Enhanced mode: Extract entities and relations
      if (USE_ENHANCED) {
        try {
          const { extractEntitiesAndRelations } = await import("../lib/document-intelligence")

          const { entities, relations } = await extractEntitiesAndRelations(
            content,
            document.id,
            "seed-user"
          )

          // Store entities in SurrealDB (use UPSERT to handle duplicates)
          const entityIdMap = new Map<string, string>()
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
                  metadata: entity.metadata || {},
                }
              )
            } catch (entityError) {
              console.warn(`    Warning: Failed to upsert entity ${entityId}`)
            }
            entityIdMap.set(entity.name.toLowerCase(), entityId)
          }

          // Store relations using RELATE syntax
          let relationCount = 0
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
                    context: relation.metadata?.context || "",
                    created_at: new Date().toISOString(),
                  }
                )
                relationCount++
              } catch (relateError) {
                // Skip failed relations silently
              }
            }
          }

          process.stdout.write(`    + ${entities.length} entities, ${relationCount} relations\n`)
        } catch (enhancedError) {
          console.warn(`  - Enhanced extraction failed:`, enhancedError)
        }
      }
    } else {
      process.stdout.write(`  ✓ ${config.filename} (${chunks.length} chunks, no embeddings)\n`)
    }
  }

  console.log(`  Total: ${seededCount} new, ${skippedCount} skipped`)
  return horizonLifeKB.id
}

async function seedWorkflows(createdByUserId: string) {
  console.log("\n[Workflows]")

  // Dynamically import the template to avoid path alias issues in seed context
  const { WORKFLOW_TEMPLATES } = await import("../lib/templates/workflow-templates")

  // Seed both fraud-related workflow templates
  const templateIds = ["wf-fraud-detection", "wf-fraud-investigation"]

  // API keys for public workflow access (used by HorizonLife staff dashboard)
  const workflowApiKeys: Record<string, string> = {
    "wf-fraud-detection": "wf_fraud_detect_demo_key_2026",
    "wf-fraud-investigation": "wf_fraud_investigate_demo_key_2026",
  }

  for (const templateId of templateIds) {
    const template = WORKFLOW_TEMPLATES.find((t) => t.id === templateId)
    if (!template) {
      console.log(`Template "${templateId}" not found. Skipping.`)
      continue
    }

    // Add visual properties to edges (same as gallery UI does)
    const enhancedEdges = template.edges.map((edge: Record<string, unknown>) => ({
      ...edge,
      animated: true,
      style: { stroke: "#64748b", strokeWidth: 2 },
    }))

    const workflowData = {
      name: template.name,
      description: template.description,
      nodes: template.nodes as unknown as object[],
      edges: enhancedEdges as unknown as object[],
      trigger: template.trigger as object,
      variables: template.variables as object,
      mode: (template.mode === "CHATFLOW" ? "CHATFLOW" : "STANDARD") as "STANDARD" | "CHATFLOW",
    }

    const apiKey = workflowApiKeys[templateId]

    // Upsert: update if exists, create if not
    const existing = await prisma.workflow.findFirst({
      where: { name: template.name },
    })

    if (existing) {
      await prisma.workflow.update({
        where: { id: existing.id },
        data: {
          ...workflowData,
          status: "ACTIVE",
          apiEnabled: true,
          apiKey,
        },
      })
      console.log(`  ~ ${template.name} (updated, ${workflowData.mode}, API enabled)`)
    } else {
      const workflow = await prisma.workflow.create({
        data: {
          ...workflowData,
          status: "ACTIVE",
          createdBy: createdByUserId,
          apiEnabled: true,
          apiKey,
        },
      })
      console.log(`  + ${workflow.name} (${workflowData.mode}, API enabled)`)
    }
  }
}

// All built-in assistants — single source of truth for seeding
const BUILT_IN_ASSISTANTS = [
  {
    id: "horizon-life",
    name: "Horizon Life Assistant",
    description: "Insurance expert for HorizonLife",
    emoji: "🏠",
    systemPrompt: HORIZON_LIFE_SEED_PROMPT,
    useKnowledgeBase: true,
    knowledgeBaseGroupIds: ["horizon-life-kb"],
    isSystemDefault: true,
    isBuiltIn: true,
    liveChatEnabled: true,
  },
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
  },
]

async function seedAssistants() {
  console.log("\n[Assistants]")

  for (const assistant of BUILT_IN_ASSISTANTS) {
    const existing = await prisma.assistant.findUnique({ where: { id: assistant.id } })
    if (existing) {
      console.log(`  ~ ${assistant.name} (${assistant.id}) — already exists, skipped`)
    } else {
      await prisma.assistant.create({ data: assistant })
      console.log(`  ${assistant.isSystemDefault ? "★" : "+"} ${assistant.name} (${assistant.id})`)
    }
  }

  console.log(`  Total: ${BUILT_IN_ASSISTANTS.length} built-in assistants`)
}

async function seedEmbedKey() {
  console.log("\n[Widget Embed Key]")

  const EMBED_KEY = "rantai_live_IvG2y_Y-DnhRGPzoK8VolScMd2cydNyA"
  const ASSISTANT_ID = "horizon-life"

  const embedKey = await prisma.embedApiKey.upsert({
    where: { key: EMBED_KEY },
    update: {},
    create: {
      name: "HorizonLife Demo Widget",
      key: EMBED_KEY,
      assistantId: ASSISTANT_ID,
      allowedDomains: ["localhost", "*.localhost"],
      config: {
        welcomeMessage: "Halo! Saya asisten HorizonLife. Ada yang bisa saya bantu?",
        position: "bottom-right",
      },
      enabled: true,
    },
  })

  console.log(`  ✓ ${embedKey.name} (key: ${EMBED_KEY.slice(0, 20)}...)`)
}

// Insurance data removed — now managed by HorizonLife-Demo directly
// See: HorizonLife-Demo/prisma/seed.ts → seedInsuranceData()

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
  console.log("\n--- Seeding Marketplace Catalog ---")

  const { STATIC_CATALOG } = await import("../lib/marketplace/catalog")

  for (const item of STATIC_CATALOG) {
    await prisma.catalogItem.upsert({
      where: { id: item.id },
      update: {
        displayName: item.displayName,
        description: item.description,
        category: item.category,
        type: item.type,
        icon: item.icon,
        tags: item.tags,
        skillContent: item.skillTemplate?.content || null,
        skillCategory: item.skillTemplate?.category || null,
        toolTemplate: item.toolTemplate ? (item.toolTemplate as object) : null,
      },
      create: {
        id: item.id,
        name: item.name,
        displayName: item.displayName,
        description: item.description,
        category: item.category,
        type: item.type,
        icon: item.icon,
        tags: item.tags,
        skillContent: item.skillTemplate?.content || null,
        skillCategory: item.skillTemplate?.category || null,
        toolTemplate: item.toolTemplate ? (item.toolTemplate as object) : null,
      },
    })
  }

  console.log(`Seeded ${STATIC_CATALOG.length} catalog items`)
}

async function main() {
  console.log("\n🌱 RantAI Agents — Database Seed\n")

  // FORCE_RESEED: clean up memory + assistants BEFORE seeding
  await forceReseedCleanup()

  // Create test users
  const passwordHash = await hash("password123", 12)

  const user1 = await prisma.user.upsert({
    where: { email: "agent@rantai.com" },
    update: {},
    create: {
      email: "agent@rantai.com",
      name: "Sarah Johnson",
      passwordHash,
      status: "OFFLINE",
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

  // Seed Knowledge Base
  const kbGroupId = await seedKnowledgeBase()

  // Seed Marketplace Catalog
  await seedCatalogItems()

  // Seed Workflows
  await seedWorkflows(user1.id)

  // Seed Embed Widget API Key (for HorizonLife-Demo)
  await seedEmbedKey()

  // Insurance data now managed by HorizonLife-Demo directly

  console.log("\n✅ Seed complete!")
  console.log(`  Users:      2 (agent / admin @rantai.com)`)
  console.log(`  Assistants: ${BUILT_IN_ASSISTANTS.length} built-in`)
  console.log(`  KB Group:   ${kbGroupId}`)
  console.log(`  Workflows:  2 (Fraud Detection + Investigation)`)
  console.log(`  Widget:     1 embed API key (HorizonLife)`)
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
      const { SurrealDBClient: SDB } = await import("../lib/surrealdb/client")
      await SDB.resetInstance()
    } catch {
      // ignore
    }
    process.exit(0)
  })
