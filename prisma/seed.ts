import { PrismaClient } from "@prisma/client"
import { hash } from "bcryptjs"
import * as path from "path"
import * as fs from "fs"

const prisma = new PrismaClient()

// Embeddings configuration
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/embeddings"
const EMBEDDING_MODEL = "openai/text-embedding-3-small"

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
]

// Simple text chunking for seed (without OpenAI embeddings initially)
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
    await prisma.documentChunk.deleteMany()
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

    // Prepare texts for embedding (include title and context)
    const textsForEmbedding = chunks.map((chunk) =>
      `${config.title}\n\n${chunk}`
    )

    // Generate embeddings
    console.log(`  - Generating embeddings...`)
    const embeddings = await generateEmbeddings(textsForEmbedding)

    // Store chunks with embeddings
    for (let i = 0; i < chunks.length; i++) {
      if (embeddings.length > 0 && embeddings[i]) {
        // Store with embedding using raw SQL
        const embeddingStr = `[${embeddings[i].join(",")}]`
        await prisma.$executeRawUnsafe(
          `INSERT INTO "DocumentChunk" (id, "documentId", content, "chunkIndex", embedding, metadata, "createdAt")
           VALUES (gen_random_uuid()::text, $1, $2, $3, $4::vector, $5::jsonb, NOW())`,
          document.id,
          chunks[i],
          i,
          embeddingStr,
          JSON.stringify({
            title: config.title,
            category: config.category,
            section: config.subcategory,
          })
        )
      } else {
        // Store without embedding
        await prisma.documentChunk.create({
          data: {
            documentId: document.id,
            content: chunks[i],
            chunkIndex: i,
            metadata: {
              title: config.title,
              category: config.category,
              section: config.subcategory,
            },
          },
        })
      }
    }

    console.log(`  - Stored document: ${config.title} with ${embeddings.length > 0 ? "embeddings" : "no embeddings"}`)
  }

  console.log("\n✓ Knowledge base seeding complete!")
  return defaultKB.id
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

  console.log("\n=== Seed Summary ===")
  console.log(`✓ Agents created: 2`)
  console.log(`✓ Knowledge Base Group ID: ${kbGroupId}`)
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
