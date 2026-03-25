/**
 * Seed pre-installed MCP servers and marketplace MCP catalog items.
 *
 * Section A: 5 pre-installed McpServerConfig (isBuiltIn: true)
 * Section B: 10 marketplace CatalogItem (type: "mcp")
 *
 * Usage: bun scripts/seed-mcp.ts [--dry-run]
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const isDryRun = process.argv.includes("--dry-run")

// ─── Section A: Pre-installed MCP Servers ───────────────────────────────────

interface PreinstalledServer {
  name: string
  description: string
  icon: string
  transport: "sse" | "streamable-http"
  url: string
  envKeys?: Array<{ key: string; label: string; placeholder: string }>
  docsUrl?: string
}

const PREINSTALLED_SERVERS: PreinstalledServer[] = [
  {
    name: "GitHub",
    description: "Manage repositories, issues, pull requests, and more via GitHub MCP",
    icon: "🐙",
    transport: "streamable-http",
    url: "https://api.githubcopilot.com/mcp/",
    envKeys: [
      {
        key: "GITHUB_PERSONAL_ACCESS_TOKEN",
        label: "GitHub Personal Access Token",
        placeholder: "ghp_xxxxxxxxxxxxxxxxxxxx",
      },
    ],
    docsUrl: "https://docs.github.com/en/copilot/github-copilot-in-vscode/using-github-copilot-with-mcp",
  },
  {
    name: "Notion",
    description: "Read, search, and manage pages and databases in Notion workspaces",
    icon: "📝",
    transport: "streamable-http",
    url: "https://mcp.notion.com/mcp",
    envKeys: [
      {
        key: "NOTION_API_KEY",
        label: "Notion API Key",
        placeholder: "ntn_xxxxxxxxxxxx",
      },
    ],
    docsUrl: "https://developers.notion.com/docs/mcp",
  },
  {
    name: "Firecrawl",
    description: "Web scraping with JavaScript rendering, batch processing, and structured data extraction",
    icon: "🔥",
    transport: "sse",
    url: "https://mcp.firecrawl.dev/sse",
    envKeys: [
      {
        key: "FIRECRAWL_API_KEY",
        label: "Firecrawl API Key",
        placeholder: "fc-xxxxxxxxxxxx",
      },
    ],
    docsUrl: "https://docs.firecrawl.dev/mcp",
  },
  {
    name: "Semgrep",
    description: "Static analysis and code security scanning powered by Semgrep",
    icon: "🛡️",
    transport: "streamable-http",
    url: "https://mcp.semgrep.ai/mcp",
    docsUrl: "https://semgrep.dev/docs/",
  },
  {
    name: "DeepWiki",
    description: "Search and query documentation from open-source repositories",
    icon: "📚",
    transport: "streamable-http",
    url: "https://mcp.deepwiki.com/mcp",
    docsUrl: "https://deepwiki.com",
  },
]

// ─── Section B: Marketplace MCP Catalog Items ───────────────────────────────

const MCP_CATALOG_ITEMS = [
  {
    name: "mcp-linear",
    displayName: "Linear",
    description: "Manage issues, projects, and teams in Linear project management",
    category: "Productivity",
    icon: "📐",
    tags: ["productivity", "project-management"],
    featured: true,
    mcpTemplate: {
      name: "Linear",
      description: "Manage issues, projects, and teams in Linear project management",
      transport: "streamable-http" as const,
      url: "https://mcp.linear.app",
      envKeys: [
        {
          key: "LINEAR_API_KEY",
          label: "Linear API Key",
          placeholder: "lin_api_xxxxxxxxxxxx",
        },
      ],
      docsUrl: "https://developers.linear.app/docs/mcp",
    },
  },
  {
    name: "mcp-slack",
    displayName: "Slack",
    description: "Read and send messages, manage channels in Slack workspaces via MCP",
    category: "Communication",
    icon: "💬",
    tags: ["messaging", "communication"],
    featured: true,
    mcpTemplate: {
      name: "Slack",
      description: "Read and send messages, manage channels in Slack workspaces via MCP",
      transport: "streamable-http" as const,
      url: "https://mcp.slack.com/mcp",
      envKeys: [
        {
          key: "SLACK_BOT_TOKEN",
          label: "Slack Bot Token (OAuth)",
          placeholder: "xoxb-xxxxxxxxxxxx",
        },
      ],
      docsUrl: "https://api.slack.com/docs/mcp",
    },
  },
  {
    name: "mcp-apify",
    displayName: "Apify",
    description: "Web scraping, browser automation, and data extraction at scale with Apify actors",
    category: "Web Scraping",
    icon: "🐝",
    tags: ["scraping", "automation"],
    featured: false,
    mcpTemplate: {
      name: "Apify",
      description: "Web scraping, browser automation, and data extraction at scale with Apify actors",
      transport: "sse" as const,
      url: "https://mcp.apify.com/sse",
      envKeys: [
        {
          key: "APIFY_API_TOKEN",
          label: "Apify API Token",
          placeholder: "apify_api_xxxxxxxxxxxx",
        },
      ],
      docsUrl: "https://docs.apify.com/platform/integrations/mcp",
    },
  },
  {
    name: "mcp-composio",
    displayName: "Composio",
    description: "Connect to 250+ apps and services through Composio's unified integration platform",
    category: "Integration",
    icon: "🔌",
    tags: ["integration", "automation"],
    featured: true,
    mcpTemplate: {
      name: "Composio",
      description: "Connect to 250+ apps and services through Composio's unified integration platform",
      transport: "streamable-http" as const,
      url: "https://mcp.composio.dev",
      envKeys: [
        {
          key: "COMPOSIO_API_KEY",
          label: "Composio API Key",
          placeholder: "composio_xxxxxxxxxxxx",
        },
      ],
      docsUrl: "https://docs.composio.dev/mcp",
    },
  },
  {
    name: "mcp-gitmcp",
    displayName: "GitMCP",
    description: "Turn any GitHub repository or documentation site into an MCP server",
    category: "Development",
    icon: "🌿",
    tags: ["dev", "documentation"],
    featured: false,
    mcpTemplate: {
      name: "GitMCP",
      description: "Turn any GitHub repository or documentation site into an MCP server",
      transport: "streamable-http" as const,
      url: "https://gitmcp.io",
      docsUrl: "https://gitmcp.io",
    },
  },
  {
    name: "mcp-asana",
    displayName: "Asana",
    description: "Manage tasks, projects, and workspaces in Asana project management",
    category: "Productivity",
    icon: "✅",
    tags: ["productivity", "project-management"],
    featured: false,
    mcpTemplate: {
      name: "Asana",
      description: "Manage tasks, projects, and workspaces in Asana project management",
      transport: "sse" as const,
      url: "https://mcp.asana.com/sse",
      envKeys: [
        {
          key: "ASANA_ACCESS_TOKEN",
          label: "Asana Personal Access Token",
          placeholder: "1/xxxxxxxxxxxx",
        },
      ],
      docsUrl: "https://developers.asana.com/docs/mcp",
    },
  },
  {
    name: "mcp-jina-reader",
    displayName: "Jina Reader",
    description: "Convert any URL to LLM-friendly content with Jina Reader API",
    category: "Web Scraping",
    icon: "📖",
    tags: ["web", "reader"],
    featured: false,
    mcpTemplate: {
      name: "Jina Reader",
      description: "Convert any URL to LLM-friendly content with Jina Reader API",
      transport: "streamable-http" as const,
      url: "https://mcp.jina.ai",
      docsUrl: "https://jina.ai/reader",
    },
  },
  {
    name: "mcp-tavily",
    displayName: "Tavily Search",
    description: "AI-optimized semantic search with direct content extraction and real-time results",
    category: "Search",
    icon: "🔍",
    tags: ["search", "ai"],
    featured: true,
    mcpTemplate: {
      name: "Tavily Search",
      description: "AI-optimized semantic search with direct content extraction and real-time results",
      transport: "streamable-http" as const,
      url: "https://mcp.tavily.com/mcp",
      envKeys: [
        {
          key: "TAVILY_API_KEY",
          label: "Tavily API Key",
          placeholder: "tvly_xxxxxxxxxxxx",
        },
      ],
      docsUrl: "https://docs.tavily.com/",
    },
  },
  {
    name: "mcp-exa",
    displayName: "Exa Search",
    description: "AI-powered semantic search engine for finding precise, relevant content",
    category: "Search",
    icon: "🧠",
    tags: ["search", "ai"],
    featured: false,
    mcpTemplate: {
      name: "Exa Search",
      description: "AI-powered semantic search engine for finding precise, relevant content",
      transport: "streamable-http" as const,
      url: "https://mcp.exa.ai/mcp",
      envKeys: [
        {
          key: "EXA_API_KEY",
          label: "Exa API Key",
          placeholder: "exa_xxxxxxxxxxxx",
        },
      ],
      docsUrl: "https://docs.exa.ai/",
    },
  },
  {
    name: "mcp-zapier",
    displayName: "Zapier",
    description: "Connect to 7,000+ apps and automate workflows through Zapier MCP",
    category: "Integration",
    icon: "⚡",
    tags: ["integration", "automation"],
    featured: true,
    mcpTemplate: {
      name: "Zapier",
      description: "Connect to 7,000+ apps and automate workflows through Zapier MCP",
      transport: "streamable-http" as const,
      url: "https://mcp.zapier.com/mcp",
      envKeys: [
        {
          key: "ZAPIER_MCP_API_KEY",
          label: "Zapier MCP API Key",
          placeholder: "zap_xxxxxxxxxxxx",
        },
      ],
      docsUrl: "https://zapier.com/mcp",
    },
  },
]

async function main() {
  console.log(
    isDryRun
      ? "[DRY RUN] Scanning MCP seed data..."
      : "Seeding MCP data..."
  )

  // ── Section A: Pre-installed servers ──
  console.log("\n--- Pre-installed MCP Servers ---")
  let preinstalledCount = 0

  for (const server of PREINSTALLED_SERVERS) {
    const needsConfig = Array.isArray(server.envKeys) && server.envKeys.length > 0

    if (isDryRun) {
      console.log(
        `  [pre-installed] ${server.name} (${server.transport}) ${needsConfig ? "- needs config" : "- ready"}`
      )
      preinstalledCount++
      continue
    }

    // Upsert by name (no org scope for pre-installed = global)
    const existing = await prisma.mcpServerConfig.findFirst({
      where: { name: server.name, isBuiltIn: true },
    })

    if (existing) {
      await prisma.mcpServerConfig.update({
        where: { id: existing.id },
        data: {
          description: server.description,
          icon: server.icon,
          transport: server.transport,
          url: server.url,
          envKeys: server.envKeys ?? undefined,
          docsUrl: server.docsUrl ?? undefined,
          isBuiltIn: true,
          configured: !needsConfig,
        },
      })
      console.log(`  Updated: ${server.name}`)
    } else {
      await prisma.mcpServerConfig.create({
        data: {
          name: server.name,
          description: server.description,
          icon: server.icon,
          transport: server.transport,
          url: server.url,
          envKeys: server.envKeys ?? undefined,
          docsUrl: server.docsUrl ?? undefined,
          isBuiltIn: true,
          enabled: true,
          configured: !needsConfig,
        },
      })
      console.log(`  Created: ${server.name}`)
    }
    preinstalledCount++
  }

  // ── Section B: Marketplace catalog items ──
  console.log("\n--- Marketplace MCP Catalog Items ---")
  let catalogCount = 0

  for (const item of MCP_CATALOG_ITEMS) {
    if (isDryRun) {
      console.log(`  [marketplace] ${item.displayName} (${item.name})`)
      catalogCount++
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
        mcpTemplate: item.mcpTemplate,
      },
      create: {
        name: item.name,
        displayName: item.displayName,
        description: item.description,
        category: item.category,
        type: "mcp",
        icon: item.icon,
        tags: item.tags,
        featured: item.featured,
        mcpTemplate: item.mcpTemplate,
      },
    })
    console.log(`  Seeded: ${item.displayName}`)
    catalogCount++
  }

  console.log(
    `\n${isDryRun ? "[DRY RUN] Would seed" : "Seeded"}: ${preinstalledCount} pre-installed servers + ${catalogCount} marketplace items`
  )
}

main()
  .catch((err) => {
    console.error("Seed failed:", err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
