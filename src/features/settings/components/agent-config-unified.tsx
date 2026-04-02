import { DashboardPageHeader } from "@/app/dashboard/_components/dashboard-page-header"
import ToolsSettingsPage from "@/src/features/tools/components/tools-settings-page"
import SkillsSettingsPage from "@/src/features/skills/components/skills-settings-page"
import McpSettingsPage from "@/src/features/mcp/components/mcp-settings-page"
import CredentialsSettingsPage from "@/src/features/credentials/components/credentials-settings-page"
import { SettingsTabs } from "./settings-tabs"

interface Props {
  searchParams: Promise<{ tab?: string }>
}

export default async function AgentConfigUnified({ searchParams }: Props) {
  const { tab = "tools" } = await searchParams

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-6">
        <DashboardPageHeader
          title="Agent Config"
          subtitle="Manage tools, skills, MCP servers, and API credentials"
          inline
        />
        <div className="mt-6">
          <SettingsTabs
            basePath="/dashboard/settings/agent-config"
            activeTab={tab}
            tabs={[
              { value: "tools", label: "Tools" },
              { value: "skills", label: "Skills" },
              { value: "mcp", label: "MCP" },
              { value: "credentials", label: "Credentials" },
            ]}
          />
          <div className="mt-4">
            {tab === "tools" && <ToolsSettingsPage />}
            {tab === "skills" && <SkillsSettingsPage />}
            {tab === "mcp" && <McpSettingsPage />}
            {tab === "credentials" && <CredentialsSettingsPage />}
          </div>
        </div>
      </div>
    </div>
  )
}
