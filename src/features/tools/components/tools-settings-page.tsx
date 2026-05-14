import { auth } from "@/lib/auth"
import { resolveActiveOrgServer } from "@/lib/org-context"
import { listToolsForDashboard } from "@/features/tools/service"
import ToolsSettingsClient from "./tools-settings-client"
import type { ToolItem } from "@/hooks/use-tools"

function normalizeCategory(category: string): ToolItem["category"] {
  if (
    category === "builtin" ||
    category === "custom" ||
    category === "mcp" ||
    category === "openapi" ||
    category === "community"
  ) {
    return category
  }
  return "custom"
}

function mapTool(item: Awaited<ReturnType<typeof listToolsForDashboard>>[number]): ToolItem {
  return {
    ...item,
    category: normalizeCategory(item.category),
    parameters: (item.parameters as object | null) ?? {},
    executionConfig: item.executionConfig as ToolItem["executionConfig"],
  }
}

export default async function ToolsSettingsPage() {
  const session = await auth()

  if (!session?.user?.id) {
    return <ToolsSettingsClient initialTools={[]} />
  }

  const orgContext = await resolveActiveOrgServer(session.user.id)
  const tools = await listToolsForDashboard(orgContext?.organizationId ?? null)

  return <ToolsSettingsClient initialTools={tools.map(mapTool)} />
}
