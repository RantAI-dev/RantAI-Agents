export interface MarketplaceCatalogItem {
  id: string
  name: string
  displayName: string
  description: string
  category: string
  type: "tool" | "skill" | "workflow" | "assistant" | "mcp"
  icon: string // Lucide icon name or emoji
  tags: string[]
  featured?: boolean
  sourceUrl?: string
  toolTemplate?: {
    name: string
    displayName: string
    description: string
    parameters: object
    executionConfig: {
      url: string
      method: string
      headers?: Record<string, string>
    }
  }
  skillTemplate?: {
    name: string
    displayName: string
    description: string
    content: string
    category: string
    tags: string[]
  }
  workflowTemplate?: object // WorkflowExportFormat (version 1 JSON)
  assistantTemplate?: {
    name: string
    description: string
    emoji: string
    systemPrompt: string
    model: string
    suggestedToolNames: string[]
    suggestedSkillNames?: string[]
    useKnowledgeBase: boolean
    memoryConfig: object
    tags: string[]
  }
  mcpTemplate?: {
    name: string
    description: string
    transport: "sse" | "streamable-http"
    url: string
    envKeys?: Array<{ key: string; label: string; placeholder: string }>
    docsUrl?: string
  }
  // Community package references
  communitySkillName?: string // Maps to CommunitySkillDefinition.name in registry
  communityToolName?: string // Maps to CommunityToolDefinition.name in registry
  configSchema?: object // JSON Schema for skill config form on install
}

export interface MarketplaceInstallInfo {
  id: string
  catalogItemId: string
  itemType: string
  installedId: string
  organizationId: string
  createdAt: string
}
