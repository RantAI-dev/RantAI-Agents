/**
 * Maps dashboard integration credentials to MCP server configs.
 */

export interface McpServerConfig {
  command: string
  args: string[]
  env: Record<string, string>
}

export function getMcpServerConfig(
  integrationId: string,
  credentials: Record<string, string>,
): McpServerConfig | null {
  switch (integrationId) {
    case "github":
      return {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: {
          GITHUB_PERSONAL_ACCESS_TOKEN: credentials.token || credentials.accessToken || "",
        },
      }
    case "slack":
      return {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-slack"],
        env: {
          SLACK_BOT_TOKEN: credentials.botToken || "",
          SLACK_TEAM_ID: credentials.teamId || "",
        },
      }
    case "notion":
      return {
        command: "npx",
        args: ["-y", "@notionhq/notion-mcp-server"],
        env: {
          OPENAPI_MCP_HEADERS: JSON.stringify({
            Authorization: `Bearer ${credentials.token || ""}`,
            "Notion-Version": "2022-06-28",
          }),
        },
      }
    case "linear":
      return {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-linear"],
        env: {
          LINEAR_API_KEY: credentials.apiKey || "",
        },
      }
    case "smtp":
      return {
        command: "node",
        args: ["/opt/mcp-servers/smtp/index.js"],
        env: {
          SMTP_HOST: credentials.host || "",
          SMTP_PORT: credentials.port || "587",
          SMTP_USER: credentials.user || credentials.username || "",
          SMTP_PASS: credentials.pass || credentials.password || "",
          SMTP_FROM: credentials.from || credentials.fromEmail || "",
        },
      }
    case "custom-api":
      return {
        command: "node",
        args: ["/opt/mcp-servers/custom-api/index.js"],
        env: {
          BASE_URL: credentials.baseUrl || "",
          API_KEY: credentials.apiKey || "",
          CUSTOM_HEADERS: credentials.headers || "{}",
        },
      }
    case "custom-mcp":
      return {
        command: credentials.command || "npx",
        args: (credentials.args || "").split(" ").filter(Boolean),
        env: credentials.env ? JSON.parse(credentials.env) : {},
      }
    default:
      return null
  }
}

export const MCP_INTEGRATION_IDS = [
  "github", "slack", "notion", "linear", "smtp", "custom-api", "custom-mcp",
] as const

export function isMcpIntegration(integrationId: string): boolean {
  return (MCP_INTEGRATION_IDS as readonly string[]).includes(integrationId)
}
