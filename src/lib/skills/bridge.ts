export interface BridgeMapping {
  type: "builtin" | "marketplace" | "mcp" | "custom"
  toolName?: string
  catalogItemId?: string
  displayName: string
  description: string
  setupUrl?: string
}

/**
 * Static mapping of known CLI binaries, tool names, and integrations
 * to platform tools or marketplace catalog items.
 */
const BRIDGE_MAP: Record<string, BridgeMapping> = {
  // CLI binaries → marketplace equivalents
  gog: {
    type: "marketplace",
    catalogItemId: "mp-google-calendar",
    displayName: "Google Calendar",
    description: "Google Workspace integration",
  },
  gh: {
    type: "marketplace",
    catalogItemId: "mp-github-issues",
    displayName: "GitHub",
    description: "GitHub Issues & PRs",
  },
  jira: {
    type: "marketplace",
    catalogItemId: "mp-jira",
    displayName: "Jira",
    description: "Jira project management",
  },
  slack: {
    type: "marketplace",
    catalogItemId: "mp-slack",
    displayName: "Slack",
    description: "Slack messaging",
  },
  notion: {
    type: "marketplace",
    catalogItemId: "mp-notion",
    displayName: "Notion",
    description: "Notion workspace",
  },
  linear: {
    type: "marketplace",
    catalogItemId: "mp-linear",
    displayName: "Linear",
    description: "Linear issue tracking",
  },

  // Named tool references → builtin
  knowledge_search: {
    type: "builtin",
    toolName: "knowledge_search",
    displayName: "Knowledge Search",
    description: "Search knowledge base",
  },
  web_search: {
    type: "builtin",
    toolName: "web_search",
    displayName: "Web Search",
    description: "Search the web",
  },
  document_analysis: {
    type: "builtin",
    toolName: "document_analysis",
    displayName: "Document Analysis",
    description: "Analyze documents",
  },
  create_artifact: {
    type: "builtin",
    toolName: "create_artifact",
    displayName: "Create Artifact",
    description: "Create code/content artifacts",
  },
  customer_lookup: {
    type: "builtin",
    toolName: "customer_lookup",
    displayName: "Customer Lookup",
    description: "Look up customer information",
  },
  channel_dispatch: {
    type: "builtin",
    toolName: "channel_dispatch",
    displayName: "Channel Dispatch",
    description: "Send messages to channels",
  },

  // Integration names → marketplace
  google: {
    type: "marketplace",
    catalogItemId: "mp-google-calendar",
    displayName: "Google Workspace",
    description: "Google Calendar, Sheets, etc.",
  },
  github: {
    type: "marketplace",
    catalogItemId: "mp-github-issues",
    displayName: "GitHub",
    description: "GitHub integration",
  },
  discord: {
    type: "marketplace",
    catalogItemId: "mp-discord",
    displayName: "Discord",
    description: "Discord bot integration",
  },
  zendesk: {
    type: "marketplace",
    catalogItemId: "mp-zendesk",
    displayName: "Zendesk",
    description: "Zendesk support",
  },
  stripe: {
    type: "marketplace",
    catalogItemId: "mp-stripe",
    displayName: "Stripe",
    description: "Stripe payments",
  },
  twilio: {
    type: "marketplace",
    catalogItemId: "mp-twilio",
    displayName: "Twilio",
    description: "Twilio messaging",
  },
  hubspot: {
    type: "marketplace",
    catalogItemId: "mp-hubspot",
    displayName: "HubSpot",
    description: "HubSpot CRM",
  },
  salesforce: {
    type: "marketplace",
    catalogItemId: "mp-salesforce",
    displayName: "Salesforce",
    description: "Salesforce CRM",
  },
}

/**
 * Look up a bridge mapping for a requirement key (CLI binary, tool name, or integration).
 * Returns null if no mapping exists.
 */
export function resolveBridge(requirement: string): BridgeMapping | null {
  return BRIDGE_MAP[requirement.toLowerCase()] ?? null
}

/** Get all known bridge mappings */
export function getAllBridgeMappings(): Record<string, BridgeMapping> {
  return { ...BRIDGE_MAP }
}
