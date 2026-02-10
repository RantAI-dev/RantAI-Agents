export interface McpServerTemplate {
  id: string
  name: string
  description: string
  icon: string
  transport: "stdio" | "sse" | "streamable-http"
  command?: string
  args?: string[]
  url?: string
  envKeys?: Array<{ key: string; label: string; placeholder: string }>
  docsUrl?: string
  tags: string[]
}

export const MCP_SERVER_TEMPLATES: McpServerTemplate[] = [
  {
    id: "filesystem",
    name: "Filesystem",
    description: "Read, write, and manage files on the local filesystem",
    icon: "FolderOpen",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/directory"],
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
    tags: ["files", "official"],
  },
  {
    id: "github",
    name: "GitHub",
    description: "Manage repositories, issues, pull requests, and more via GitHub API",
    icon: "Github",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    envKeys: [
      {
        key: "GITHUB_PERSONAL_ACCESS_TOKEN",
        label: "GitHub Token",
        placeholder: "ghp_xxxxxxxxxxxxxxxxxxxx",
      },
    ],
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/github",
    tags: ["dev", "official"],
  },
  {
    id: "postgres",
    name: "PostgreSQL",
    description: "Query and manage PostgreSQL databases with read-only access",
    icon: "Database",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-postgres", "postgresql://user:pass@localhost:5432/db"],
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/postgres",
    tags: ["database", "official"],
  },
  {
    id: "slack",
    name: "Slack",
    description: "Read and send messages, manage channels in Slack workspaces",
    icon: "MessageSquare",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-slack"],
    envKeys: [
      {
        key: "SLACK_BOT_TOKEN",
        label: "Slack Bot Token",
        placeholder: "xoxb-xxxxxxxxxxxx",
      },
      {
        key: "SLACK_TEAM_ID",
        label: "Team ID",
        placeholder: "T01234567",
      },
    ],
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/slack",
    tags: ["messaging", "official"],
  },
  {
    id: "brave-search",
    name: "Brave Search",
    description: "Search the web using Brave Search API for real-time results",
    icon: "Search",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-brave-search"],
    envKeys: [
      {
        key: "BRAVE_API_KEY",
        label: "Brave API Key",
        placeholder: "BSA_xxxxxxxxxxxx",
      },
    ],
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search",
    tags: ["search", "official"],
  },
  {
    id: "memory",
    name: "Memory",
    description: "Persistent memory store using knowledge graphs for long-term context",
    icon: "Brain",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"],
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/memory",
    tags: ["knowledge", "official"],
  },
  {
    id: "gdrive",
    name: "Google Drive",
    description: "Search and read files from Google Drive accounts",
    icon: "HardDrive",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-gdrive"],
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/gdrive",
    tags: ["files", "official"],
  },
]
