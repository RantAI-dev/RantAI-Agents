// MCP server templates are no longer used.
// Pre-installed servers come from DB seed (scripts/seed-mcp.ts).
// Marketplace servers come from CatalogItem records.
//
// This file is kept as a stub to avoid breaking any residual imports.

export interface McpServerTemplate {
  id: string
  name: string
  description: string
  icon: string
  transport: "sse" | "streamable-http"
  url?: string
  envKeys?: Array<{ key: string; label: string; placeholder: string }>
  docsUrl?: string
  tags: string[]
}

export const MCP_SERVER_TEMPLATES: McpServerTemplate[] = []
