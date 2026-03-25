import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import { listDashboardMcpServers } from "@/src/features/mcp/servers/service"
import McpSettingsClient from "./mcp-settings-client"
import type { McpServerItem } from "@/hooks/use-mcp-servers"

function normalizeTransport(value: string): McpServerItem["transport"] {
  return value === "streamable-http" ? "streamable-http" : "sse"
}

function mapServer(
  item: Awaited<ReturnType<typeof listDashboardMcpServers>>[number]
): McpServerItem {
  return {
    ...item,
    transport: normalizeTransport(item.transport),
    envKeys: (item.envKeys as McpServerItem["envKeys"]) ?? null,
  }
}

export default async function McpSettingsPage() {
  const session = await auth()

  if (!session?.user?.id) {
    return <McpSettingsClient initialServers={[]} />
  }

  const requestHeaders = await headers()
  const request = new Request("http://localhost", {
    headers: new Headers(requestHeaders),
  })

  const orgContext = await getOrganizationContextWithFallback(request, session.user.id)
  const servers = await listDashboardMcpServers(orgContext?.organizationId ?? null)

  return <McpSettingsClient initialServers={servers.map(mapServer)} />
}
