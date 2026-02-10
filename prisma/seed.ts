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
  console.log("\n--- Seeding Knowledge Base ---")

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

  console.log(`Created Knowledge Base: ${defaultKB.name} (${defaultKB.id})`)

  // Check if documents already exist
  const existingDocs = await prisma.document.count()
  if (existingDocs > 0) {
    console.log(`Found ${existingDocs} existing documents. Skipping document seeding.`)
    console.log("Run with FORCE_RESEED=true to reseed documents.")

    if (process.env.FORCE_RESEED !== "true") {
      return defaultKB.id
    }

    // Clear existing documents if forcing reseed
    console.log("Force reseeding - clearing existing documents...")

    // Clear SurrealDB chunks, entities, and relations
    try {
      const surrealClient = await SurrealDBClient.getInstance(getSurrealDBConfigFromEnv())

      // Dynamically discover and clear all relation tables
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
      console.log("  - SurrealDB ready for fresh data")
    } catch (error) {
      console.warn("  - Warning: Could not clear SurrealDB data (may not be running)")
    }

    // Clear PostgreSQL documents
    await prisma.documentGroup.deleteMany()
    await prisma.document.deleteMany()
  }

  // Find knowledge base directory
  const knowledgeBasePath = path.join(process.cwd(), "knowledge-base")

  if (!fs.existsSync(knowledgeBasePath)) {
    console.log(`Knowledge base path not found: ${knowledgeBasePath}`)
    console.log("You can add documents later via the dashboard at /dashboard/knowledge")
    return defaultKB.id
  }

  console.log(`\nIngesting documents from: ${knowledgeBasePath}`)
  if (USE_ENHANCED) {
    console.log("🧠 Enhanced mode enabled - will extract entities and relations")
  }

  // Initialize SurrealDB client
  let surrealClient: SurrealDBClient | null = null
  try {
    surrealClient = await SurrealDBClient.getInstance(getSurrealDBConfigFromEnv())
    console.log("Connected to SurrealDB for vector storage")
  } catch (error) {
    console.warn("Warning: Could not connect to SurrealDB. Documents will be created without embeddings.")
    console.warn("Start SurrealDB with: docker-compose up surrealdb")
  }

  // Process each document
  for (const config of KNOWLEDGE_BASE_CONFIG) {
    const filePath = path.join(knowledgeBasePath, config.filename)

    if (!fs.existsSync(filePath)) {
      console.warn(`  - Skipping: ${config.filename} (not found)`)
      continue
    }

    console.log(`\nProcessing: ${config.filename}`)

    // Read file content
    const content = fs.readFileSync(filePath, "utf-8")

    // Create the document with group association
    const document = await prisma.document.create({
      data: {
        title: config.title,
        content,
        categories: [config.category],
        subcategory: config.subcategory,
        metadata: { fileType: "markdown" },
        groups: {
          create: {
            groupId: defaultKB.id,
          },
        },
      },
    })

    // Create chunks
    const chunks = chunkText(content)
    console.log(`  - Created ${chunks.length} chunks`)

    if (surrealClient) {
      // Prepare texts for embedding (include title and context)
      const textsForEmbedding = chunks.map((chunk) =>
        `${config.title}\n\n${chunk}`
      )

      // Generate embeddings
      console.log(`  - Generating embeddings...`)
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

      console.log(`  - Stored document: ${config.title} with ${embeddings.length > 0 ? "embeddings" : "no embeddings"}`)

      // Enhanced mode: Extract entities and relations
      if (USE_ENHANCED) {
        try {
          console.log(`  - Extracting entities and relations...`)
          const { extractEntitiesAndRelations } = await import("../lib/document-intelligence")

          const { entities, relations } = await extractEntitiesAndRelations(
            content,
            document.id,
            "seed-user"
          )

          console.log(`    Found ${entities.length} entities, ${relations.length} relations`)

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

          console.log(`    Stored ${entities.length} entities, ${relationCount} relations`)
        } catch (enhancedError) {
          console.warn(`  - Enhanced extraction failed:`, enhancedError)
        }
      }
    } else {
      console.log(`  - Stored document: ${config.title} (no embeddings - SurrealDB not available)`)
    }
  }

  console.log("\n✓ Knowledge base seeding complete!")
  return defaultKB.id
}

async function seedWorkflows(createdByUserId: string) {
  console.log("\n--- Seeding Workflows ---")

  // Dynamically import the template to avoid path alias issues in seed context
  const { WORKFLOW_TEMPLATES } = await import("../lib/templates/workflow-templates")

  const fraudTemplate = WORKFLOW_TEMPLATES.find((t) => t.id === "wf-fraud-detection")
  if (!fraudTemplate) {
    console.log("Fraud detection template not found. Skipping workflow seeding.")
    return
  }

  // Check if workflow already exists (idempotent)
  const existing = await prisma.workflow.findFirst({
    where: { name: fraudTemplate.name },
  })

  if (existing) {
    console.log(`Workflow "${fraudTemplate.name}" already exists (${existing.id}). Skipping.`)
    return
  }

  const workflow = await prisma.workflow.create({
    data: {
      name: fraudTemplate.name,
      description: fraudTemplate.description,
      nodes: fraudTemplate.nodes as unknown as object[],
      edges: fraudTemplate.edges as unknown as object[],
      trigger: fraudTemplate.trigger as object,
      variables: fraudTemplate.variables as object,
      status: "DRAFT",
      createdBy: createdByUserId,
    },
  })

  console.log(`Created workflow: ${workflow.name} (${workflow.id})`)
}

async function main() {
  console.log("=== RantAI Agents - Database Seed ===\n")

  // Create test agents
  const passwordHash = await hash("password123", 12)

  const agent1 = await prisma.agent.upsert({
    where: { email: "agent@rantai.com" },
    update: {},
    create: {
      email: "agent@rantai.com",
      name: "Sarah Johnson",
      passwordHash,
      status: "OFFLINE",
    },
  })

  const agent2 = await prisma.agent.upsert({
    where: { email: "admin@rantai.com" },
    update: {},
    create: {
      email: "admin@rantai.com",
      name: "Michael Chen",
      passwordHash,
      status: "OFFLINE",
    },
  })

  console.log("Seeded agents:")
  console.log(`  - ${agent1.name} (${agent1.email})`)
  console.log(`  - ${agent2.name} (${agent2.email})`)

  console.log("\n📋 Agent Login Credentials:")
  console.log("  Email: agent@rantai.com")
  console.log("  Password: password123")

  // Seed Knowledge Base
  const kbGroupId = await seedKnowledgeBase()

  // Seed Workflows
  await seedWorkflows(agent1.id)

  console.log("\n=== Seed Summary ===")
  console.log(`✓ Agents created: 2`)
  console.log(`✓ Knowledge Base Group ID: ${kbGroupId}`)
  console.log(`✓ Workflows seeded`)
  console.log("\n🚀 To start the app:")
  console.log("  1. Run: pnpm dev")
  console.log("  2. Open: http://localhost:3000")
  console.log("  3. Login with agent@rantai.com / password123")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
