/**
 * Seed CatalogItem records for all built-in tools.
 * These appear in the marketplace as always-installed, non-removable items.
 *
 * Usage: npx tsx scripts/seed-catalog.ts [--dry-run]
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const isDryRun = process.argv.includes("--dry-run")

const BUILTIN_CATALOG_ITEMS = [
  {
    name: "builtin-tool-knowledge_search",
    displayName: "Knowledge Search",
    description:
      "Search through your knowledge base and documents using semantic similarity to find relevant information.",
    category: "Built-in",
    type: "tool" as const,
    icon: "📚",
    tags: ["knowledge", "search", "rag", "documents"],
    featured: true,
  },
  {
    name: "builtin-tool-web_search",
    displayName: "Web Search",
    description:
      "Search the web for real-time information using multiple search providers (Serper, SearXNG, DuckDuckGo).",
    category: "Built-in",
    type: "tool" as const,
    icon: "🔍",
    tags: ["web", "search", "internet", "real-time"],
    featured: true,
  },
  {
    name: "builtin-tool-calculator",
    displayName: "Calculator",
    description:
      "Evaluate mathematical expressions safely, including arithmetic, percentages, and common math functions.",
    category: "Built-in",
    type: "tool" as const,
    icon: "🧮",
    tags: ["math", "calculator", "arithmetic"],
    featured: false,
  },
  {
    name: "builtin-tool-date_time",
    displayName: "Date & Time",
    description:
      "Get the current date and time, format dates, calculate durations, and perform timezone conversions.",
    category: "Built-in",
    type: "tool" as const,
    icon: "⏰",
    tags: ["date", "time", "timezone", "calendar"],
    featured: false,
  },
  {
    name: "builtin-tool-create_artifact",
    displayName: "Create Artifact",
    description:
      "Create rich code or content artifacts (HTML, React, SVG, Markdown, Mermaid diagrams) with S3 persistence.",
    category: "Built-in",
    type: "tool" as const,
    icon: "🎨",
    tags: ["artifact", "code", "html", "react", "svg", "markdown"],
    featured: true,
  },
  {
    name: "builtin-tool-update_artifact",
    displayName: "Update Artifact",
    description:
      "Modify and update existing artifacts that were previously created.",
    category: "Built-in",
    type: "tool" as const,
    icon: "✏️",
    tags: ["artifact", "edit", "update"],
    featured: false,
  },
  {
    name: "builtin-tool-document_analysis",
    displayName: "Document Analysis",
    description:
      "Extract structured entities from text — people, organizations, dates, emails, URLs, and more.",
    category: "Built-in",
    type: "tool" as const,
    icon: "📄",
    tags: ["document", "analysis", "nlp", "extraction"],
    featured: false,
  },
  {
    name: "builtin-tool-customer_lookup",
    displayName: "Customer Lookup",
    description:
      "Look up customer information and interaction history by name or email address.",
    category: "Built-in",
    type: "tool" as const,
    icon: "👥",
    tags: ["customer", "crm", "lookup", "history"],
    featured: false,
  },
  {
    name: "builtin-tool-channel_dispatch",
    displayName: "Channel Dispatch",
    description:
      "Route and send messages to external channels — WhatsApp, Email, or Salesforce.",
    category: "Built-in",
    type: "tool" as const,
    icon: "📤",
    tags: ["dispatch", "whatsapp", "email", "salesforce", "messaging"],
    featured: false,
  },
  {
    name: "builtin-tool-file_operations",
    displayName: "File Operations",
    description:
      "Generate presigned download URLs for files stored in S3 cloud storage.",
    category: "Built-in",
    type: "tool" as const,
    icon: "📁",
    tags: ["files", "s3", "storage", "download"],
    featured: false,
  },
  {
    name: "builtin-tool-json_transform",
    displayName: "JSON Transform",
    description:
      "Transform, filter, and reformat JSON data using path expressions and transformation operations.",
    category: "Built-in",
    type: "tool" as const,
    icon: "🔄",
    tags: ["json", "transform", "data", "formatting"],
    featured: false,
  },
  {
    name: "builtin-tool-text_utilities",
    displayName: "Text Utilities",
    description:
      "Process text with utilities like word count, character count, case conversion, and string manipulation.",
    category: "Built-in",
    type: "tool" as const,
    icon: "🔤",
    tags: ["text", "string", "utilities", "processing"],
    featured: false,
  },
]

async function main() {
  console.log(
    isDryRun
      ? "[DRY RUN] Scanning built-in tools catalog..."
      : "Seeding built-in tools catalog items..."
  )

  let count = 0

  for (const item of BUILTIN_CATALOG_ITEMS) {
    if (isDryRun) {
      console.log(`  [builtin] ${item.displayName} (${item.name})`)
      count++
      continue
    }

    await prisma.catalogItem.upsert({
      where: { name: item.name },
      update: {
        displayName: item.displayName,
        description: item.description,
        icon: item.icon,
        tags: item.tags,
        featured: item.featured,
      },
      create: {
        name: item.name,
        displayName: item.displayName,
        description: item.description,
        category: item.category,
        type: item.type,
        icon: item.icon,
        tags: item.tags,
        featured: item.featured,
      },
    })
    console.log(`  Seeded: ${item.displayName}`)
    count++
  }

  console.log(
    `\n${isDryRun ? "[DRY RUN] Would seed" : "Seeded"}: ${count} built-in tools`
  )
}

main()
  .catch((err) => {
    console.error("Seed failed:", err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
