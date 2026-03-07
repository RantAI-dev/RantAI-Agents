export interface IntegrationDefinition {
  id: string
  name: string
  description: string
  icon: string  // emoji
  category: "communication" | "development" | "productivity" | "custom"
  setupType: "api-key" | "oauth" | "credentials" | "chat-guided" | "custom"
  fields: Array<{
    key: string
    label: string
    type: "text" | "password" | "url" | "textarea"
    required: boolean
    placeholder?: string
    helpText?: string
  }>
  testEndpoint?: string  // URL pattern to test connectivity
  documentationUrl?: string
}

export const INTEGRATION_REGISTRY: IntegrationDefinition[] = [
  {
    id: "slack",
    name: "Slack",
    description: "Send and receive messages in Slack channels",
    icon: "\u{1F4AC}",
    category: "communication",
    setupType: "oauth",
    fields: [
      { key: "botToken", label: "Bot Token", type: "password", required: true, placeholder: "xoxb-...", helpText: "Found in your Slack app settings" },
      { key: "signingSecret", label: "Signing Secret", type: "password", required: true },
    ],
    testEndpoint: "https://slack.com/api/auth.test",
  },
  {
    id: "github",
    name: "GitHub",
    description: "Access repositories, issues, and pull requests",
    icon: "\u{1F419}",
    category: "development",
    setupType: "api-key",
    fields: [
      { key: "token", label: "Personal Access Token", type: "password", required: true, placeholder: "ghp_...", helpText: "Generate at github.com/settings/tokens" },
    ],
    testEndpoint: "https://api.github.com/user",
  },
  {
    id: "gmail",
    name: "Gmail",
    description: "Read and send emails via Gmail",
    icon: "\u{1F4E7}",
    category: "communication",
    setupType: "oauth",
    fields: [
      { key: "clientId", label: "Client ID", type: "text", required: true },
      { key: "clientSecret", label: "Client Secret", type: "password", required: true },
    ],
  },
  {
    id: "linear",
    name: "Linear",
    description: "Manage issues and projects in Linear",
    icon: "\u{1F4CB}",
    category: "development",
    setupType: "api-key",
    fields: [
      { key: "apiKey", label: "API Key", type: "password", required: true, placeholder: "lin_api_...", helpText: "Found in Linear Settings > API" },
    ],
    testEndpoint: "https://api.linear.app/graphql",
  },
  {
    id: "notion",
    name: "Notion",
    description: "Access and update Notion pages and databases",
    icon: "\u{1F4DD}",
    category: "productivity",
    setupType: "api-key",
    fields: [
      { key: "token", label: "Integration Token", type: "password", required: true, placeholder: "secret_...", helpText: "Create at notion.so/my-integrations" },
    ],
    testEndpoint: "https://api.notion.com/v1/users/me",
  },
  {
    id: "discord",
    name: "Discord",
    description: "Send messages and interact in Discord servers",
    icon: "\u{1F3AE}",
    category: "communication",
    setupType: "api-key",
    fields: [
      { key: "botToken", label: "Bot Token", type: "password", required: true, helpText: "Found in Discord Developer Portal" },
    ],
    testEndpoint: "https://discord.com/api/v10/users/@me",
  },
  {
    id: "smtp",
    name: "SMTP Email",
    description: "Send emails via any SMTP server",
    icon: "\u2709\uFE0F",
    category: "communication",
    setupType: "credentials",
    fields: [
      { key: "host", label: "SMTP Host", type: "text", required: true, placeholder: "smtp.gmail.com" },
      { key: "port", label: "Port", type: "text", required: true, placeholder: "587" },
      { key: "username", label: "Username", type: "text", required: true },
      { key: "password", label: "Password", type: "password", required: true },
    ],
  },
  {
    id: "custom-api",
    name: "Custom API",
    description: "Connect to any REST API with custom credentials",
    icon: "\u{1F50C}",
    category: "custom",
    setupType: "credentials",
    fields: [
      { key: "baseUrl", label: "Base URL", type: "url", required: true, placeholder: "https://api.example.com" },
      { key: "apiKey", label: "API Key", type: "password", required: false },
      { key: "headers", label: "Custom Headers (JSON)", type: "textarea", required: false, placeholder: '{"X-Custom": "value"}' },
    ],
  },
  {
    id: "custom-mcp",
    name: "Custom MCP Server",
    description: "Connect to any MCP-compatible tool server",
    icon: "\u{1F527}",
    category: "custom",
    setupType: "chat-guided",
    fields: [
      { key: "serverUrl", label: "Server URL", type: "url", required: true, placeholder: "http://localhost:3001/mcp" },
      { key: "apiKey", label: "API Key (optional)", type: "password", required: false },
    ],
  },
]

export function getIntegrationDefinition(integrationId: string): IntegrationDefinition | undefined {
  return INTEGRATION_REGISTRY.find((i) => i.id === integrationId)
}

export function getIntegrationsByCategory(): Record<string, IntegrationDefinition[]> {
  const grouped: Record<string, IntegrationDefinition[]> = {}
  for (const integration of INTEGRATION_REGISTRY) {
    if (!grouped[integration.category]) grouped[integration.category] = []
    grouped[integration.category].push(integration)
  }
  return grouped
}

export const CATEGORY_LABELS: Record<string, string> = {
  communication: "Communication",
  development: "Development",
  productivity: "Productivity",
  custom: "Custom",
}
