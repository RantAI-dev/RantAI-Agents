export interface IntegrationDefinition {
  id: string
  name: string
  description: string
  icon: string  // path to logo SVG or emoji fallback
  category: "communication" | "development" | "productivity" | "custom"
  setupType: "api-key" | "oauth" | "credentials" | "chat-guided" | "custom" | "manual"
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
    icon: "/logos/slack.svg",
    category: "communication",
    setupType: "api-key",
    fields: [
      { key: "botToken", label: "Bot Token", type: "password", required: true, placeholder: "xoxb-...", helpText: "Bot User OAuth Token from Slack app settings → OAuth & Permissions" },
      { key: "appToken", label: "App-Level Token", type: "password", required: false, placeholder: "xapp-...", helpText: "For Socket Mode. Generate in Slack app settings → Basic Information → App-Level Tokens" },
      { key: "channelId", label: "Channel ID", type: "text", required: false, placeholder: "C0123456789", helpText: "Right-click channel → View channel details → copy ID. Leave empty to listen on all channels." },
      { key: "allowedUsers", label: "Allowed User IDs", type: "textarea", required: false, placeholder: "U0123456789, U9876543210", helpText: "Comma-separated Slack user IDs. Leave empty to allow all." },
    ],
    testEndpoint: "https://slack.com/api/auth.test",
  },
  {
    id: "github",
    name: "GitHub",
    description: "Access repositories, issues, and pull requests",
    icon: "/logos/github.svg",
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
    icon: "/logos/gmail.svg",
    category: "communication",
    setupType: "oauth",
    fields: [
      { key: "clientId", label: "Client ID", type: "text", required: true },
      { key: "clientSecret", label: "Client Secret", type: "password", required: true },
      { key: "refreshToken", label: "Refresh Token", type: "password", required: true, helpText: "OAuth refresh token for offline access" },
    ],
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    description: "Manage events and schedules in Google Calendar",
    icon: "/logos/google-calendar.svg",
    category: "productivity",
    setupType: "oauth",
    fields: [
      { key: "clientId", label: "Client ID", type: "text", required: true },
      { key: "clientSecret", label: "Client Secret", type: "password", required: true },
      { key: "refreshToken", label: "Refresh Token", type: "password", required: true, helpText: "OAuth refresh token for offline access" },
    ],
  },
  {
    id: "google-drive",
    name: "Google Drive",
    description: "Access and manage files in Google Drive",
    icon: "/logos/google-drive.svg",
    category: "productivity",
    setupType: "oauth",
    fields: [
      { key: "clientId", label: "Client ID", type: "text", required: true },
      { key: "clientSecret", label: "Client Secret", type: "password", required: true },
      { key: "refreshToken", label: "Refresh Token", type: "password", required: true, helpText: "OAuth refresh token for offline access" },
    ],
  },
  {
    id: "linear",
    name: "Linear",
    description: "Manage issues and projects in Linear",
    icon: "/logos/linear.svg",
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
    icon: "/logos/notion.svg",
    category: "productivity",
    setupType: "api-key",
    fields: [
      { key: "token", label: "Integration Token", type: "password", required: true, placeholder: "secret_...", helpText: "Create at notion.so/my-integrations" },
    ],
    testEndpoint: "https://api.notion.com/v1/users/me",
  },
  {
    id: "telegram",
    name: "Telegram",
    description: "Connect to Telegram as a bot",
    icon: "/logos/telegram.svg",
    category: "communication",
    setupType: "api-key",
    fields: [
      { key: "botToken", label: "Bot Token", type: "password", required: true, placeholder: "123456:ABC-DEF...", helpText: "Get from @BotFather on Telegram" },
      { key: "allowedUsers", label: "Allowed Users", type: "textarea", required: false, placeholder: "username1, username2 or * for all", helpText: "Comma-separated Telegram usernames. Leave empty or * to allow all." },
      { key: "mentionOnly", label: "Mention-only Mode", type: "text", required: false, placeholder: "false", helpText: "Set to 'true' to only respond when @mentioned in groups" },
    ],
  },
  {
    id: "whatsapp",
    name: "WhatsApp Business",
    description: "Connect to WhatsApp via Meta Cloud API (requires Meta Business account)",
    icon: "/logos/whatsapp.svg",
    category: "communication",
    setupType: "credentials",
    fields: [
      { key: "accessToken", label: "Access Token", type: "password", required: true, helpText: "Permanent token from Meta Business Suite" },
      { key: "phoneNumberId", label: "Phone Number ID", type: "text", required: true, helpText: "From Meta Business Suite → WhatsApp → Phone Numbers" },
      { key: "verifyToken", label: "Verify Token", type: "text", required: true, placeholder: "my-verify-token", helpText: "You define this — must match what you enter in Meta webhook config" },
      { key: "appSecret", label: "App Secret", type: "password", required: true, helpText: "From Meta App Dashboard → Settings → Basic" },
      { key: "allowedNumbers", label: "Allowed Numbers", type: "textarea", required: false, placeholder: "+1234567890, +9876543210", helpText: "Comma-separated E.164 phone numbers. Leave empty to allow all." },
    ],
  },
  {
    id: "whatsapp-web",
    name: "WhatsApp Web",
    description: "Connect using your personal WhatsApp number (pair via phone code)",
    icon: "/logos/whatsapp.svg",
    category: "communication",
    setupType: "credentials",
    fields: [
      { key: "pairPhone", label: "Phone Number", type: "text", required: true, placeholder: "15551234567", helpText: "Country code + number without + (e.g. 15551234567)" },
      { key: "allowedNumbers", label: "Allowed Numbers", type: "textarea", required: false, placeholder: "+1234567890, +9876543210", helpText: "Comma-separated E.164 phone numbers. Leave empty to allow all." },
    ],
  },
  {
    id: "discord",
    name: "Discord",
    description: "Send messages and interact in Discord servers",
    icon: "/logos/discord.svg",
    category: "communication",
    setupType: "api-key",
    fields: [
      { key: "botToken", label: "Bot Token", type: "password", required: true, helpText: "Found in Discord Developer Portal → Bot → Token" },
      { key: "guildId", label: "Server (Guild) ID", type: "text", required: false, placeholder: "123456789012345678", helpText: "Right-click server → Copy Server ID. Leave empty to allow all servers." },
      { key: "allowedUsers", label: "Allowed User IDs", type: "textarea", required: false, placeholder: "123456789012345678, 987654321098765432", helpText: "Comma-separated Discord user IDs. Leave empty to allow all." },
      { key: "mentionOnly", label: "Mention-only Mode", type: "text", required: false, placeholder: "false", helpText: "Set to 'true' to only respond when @mentioned" },
    ],
    testEndpoint: "https://discord.com/api/v10/users/@me",
  },
  {
    id: "smtp",
    name: "SMTP Email",
    description: "Send emails via any SMTP server",
    icon: "\u2709\uFE0F",
    category: "communication",
    setupType: "manual",
    fields: [
      { key: "host", label: "Host", type: "text", required: true, placeholder: "smtp.gmail.com" },
      { key: "port", label: "Port", type: "text", required: true, placeholder: "587" },
      { key: "username", label: "Username", type: "text", required: true },
      { key: "password", label: "Password", type: "password", required: true },
      { key: "fromAddress", label: "From Address", type: "text", required: true, placeholder: "noreply@example.com", helpText: "The email address to send from" },
    ],
  },
  {
    id: "custom-api",
    name: "Custom API",
    description: "Connect to any REST API with custom credentials",
    icon: "\u{1F50C}",
    category: "custom",
    setupType: "manual",
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
