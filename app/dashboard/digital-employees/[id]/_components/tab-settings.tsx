"use client"

import { useState } from "react"
import {
  ChevronDown, Settings, Wrench, Sparkles, Calendar, Trash2, Plus,
} from "@/lib/icons"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { TabTools } from "./tab-tools"
import { TabSkills } from "./tab-skills"
import { ScheduleMonitor } from "./schedule-monitor"
import type { ToolItem } from "@/hooks/use-tools"
import type { SkillItem } from "@/hooks/use-skills"
import type { EmployeeSchedule, HeartbeatConfig } from "@/lib/digital-employee/types"

interface TabSettingsProps {
  employee: {
    id: string
    name: string
    description: string | null
    avatar: string | null
    status: string
    autonomyLevel: string
    assistantId: string
    assistant: { id: string; name: string; emoji: string; model: string }
    deploymentConfig: Record<string, unknown> | null
  }
  // Tools
  allPlatformTools: ToolItem[]
  customTools: Array<{
    id: string
    digitalEmployeeId: string
    name: string
    description: string | null
    parameters: unknown
    code: string
    language: string
    enabled: boolean
    approved: boolean
    createdBy: string
    createdAt: string
    updatedAt: string
  }>
  toolsLoading: boolean
  enabledToolIds: Set<string>
  onToggleAssistantTool: (toolId: string) => Promise<void>
  toggleCustomTool: (toolId: string, enabled: boolean) => Promise<void>
  deleteCustomTool: (toolId: string) => Promise<void>
  onCreateToolOpen: () => void
  // Skills
  skills: {
    platform: Array<{
      id: string; name: string; description: string; source: string;
      enabled: boolean; icon: string; category: string; tags: string[]
    }>
    clawhub: Array<{
      id: string; name: string; slug: string; version: string;
      description: string | null; enabled: boolean; createdAt: string
    }>
  }
  allPlatformSkills: SkillItem[]
  skillsLoading: boolean
  enabledSkillIds: Set<string>
  onToggleAssistantSkill: (skillId: string) => Promise<void>
  toggleSkill: (skillId: string, enabled: boolean) => Promise<void>
  installSkill: (slug: string) => Promise<unknown>
  uninstallSkill: (skillId: string) => Promise<void>
  // Schedule
  schedules: EmployeeSchedule[]
  runs: Array<{
    id: string; trigger: string; status: string; startedAt: string;
    completedAt: string | null; executionTimeMs: number | null;
    promptTokens: number; completionTokens: number;
    workflowId: string | null; output: unknown; error: string | null
  }>
  onUpdateHeartbeat: (heartbeat: HeartbeatConfig) => Promise<void>
  // General
  fetchEmployee: () => Promise<void>
  autoRedeploy: () => Promise<void>
  onArchiveOpen: () => void
  onDeleteOpen: () => void
}

interface SectionConfig {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  badge?: string
  danger?: boolean
}

export function TabSettings(props: TabSettingsProps) {
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["identity"]))

  const toggleSection = (id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const totalEnabled = props.enabledToolIds.size + props.enabledSkillIds.size
  const sections: SectionConfig[] = [
    { id: "identity", label: "Identity", icon: Settings },
    {
      id: "tools-skills",
      label: "Tools & Skills",
      icon: Wrench,
      badge: `${totalEnabled} enabled`,
    },
    {
      id: "schedule",
      label: "Schedule",
      icon: Calendar,
      badge: props.schedules.length > 0 ? `${props.schedules.length} schedule${props.schedules.length !== 1 ? "s" : ""}` : undefined,
    },
    { id: "danger", label: "Danger Zone", icon: Trash2, danger: true },
  ]

  return (
    <div className="flex-1 overflow-auto p-5 space-y-2">
      {sections.map((section) => {
        const isOpen = openSections.has(section.id)
        const Icon = section.icon
        return (
          <Collapsible
            key={section.id}
            open={isOpen}
            onOpenChange={() => toggleSection(section.id)}
          >
            <CollapsibleTrigger asChild>
              <button
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-sm font-medium transition-colors",
                  isOpen ? "bg-card border-border" : "border-transparent hover:bg-muted/50",
                  section.danger && "text-red-500"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">{section.label}</span>
                {section.badge && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {section.badge}
                  </Badge>
                )}
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform",
                    isOpen && "rotate-180"
                  )}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="pt-1 pb-3">
                {section.id === "identity" && (
                  <SettingsIdentity
                    employee={props.employee}
                    fetchEmployee={props.fetchEmployee}
                  />
                )}
                {section.id === "tools-skills" && (
                  <ToolsSkillsCombined
                    employee={props.employee}
                    allPlatformTools={props.allPlatformTools}
                    customTools={props.customTools}
                    toolsLoading={props.toolsLoading}
                    enabledToolIds={props.enabledToolIds}
                    onToggleAssistantTool={props.onToggleAssistantTool}
                    toggleCustomTool={props.toggleCustomTool}
                    deleteCustomTool={props.deleteCustomTool}
                    onCreateToolOpen={props.onCreateToolOpen}
                    skills={props.skills}
                    allPlatformSkills={props.allPlatformSkills}
                    skillsLoading={props.skillsLoading}
                    enabledSkillIds={props.enabledSkillIds}
                    onToggleAssistantSkill={props.onToggleAssistantSkill}
                    toggleSkill={props.toggleSkill}
                    installSkill={props.installSkill}
                    uninstallSkill={props.uninstallSkill}
                    autoRedeploy={props.autoRedeploy}
                  />
                )}
                {section.id === "schedule" && (
                  <ScheduleMonitor
                    schedules={props.schedules}
                    runs={props.runs}
                    heartbeat={(props.employee.deploymentConfig as any)?.heartbeat}
                    onUpdateHeartbeat={props.onUpdateHeartbeat}
                  />
                )}
                {section.id === "danger" && (
                  <SettingsDanger
                    onArchiveOpen={props.onArchiveOpen}
                    onDeleteOpen={props.onDeleteOpen}
                  />
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )
      })}
    </div>
  )
}

// ─── Identity sub-section (inlined from TabConfig, without danger zone) ───

import { Loader2, Save } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { useCallback } from "react"

function SettingsIdentity({
  employee,
  fetchEmployee,
}: {
  employee: { id: string; name: string; description: string | null; avatar: string | null; autonomyLevel: string }
  fetchEmployee: () => Promise<void>
}) {
  const [settingsName, setSettingsName] = useState(employee.name)
  const [settingsDesc, setSettingsDesc] = useState(employee.description || "")
  const [settingsAvatar, setSettingsAvatar] = useState(employee.avatar || "")
  const [settingsAutonomy, setSettingsAutonomy] = useState(employee.autonomyLevel)
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = useCallback(async () => {
    setIsSaving(true)
    try {
      const res = await fetch(`/api/dashboard/digital-employees/${employee.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: settingsName.trim(),
          description: settingsDesc.trim() || null,
          avatar: settingsAvatar.trim() || null,
          autonomyLevel: settingsAutonomy,
        }),
      })
      if (!res.ok) throw new Error("Failed to update")
      await fetchEmployee()
      toast.success("Settings saved")
    } catch {
      toast.error("Failed to save settings")
    } finally {
      setIsSaving(false)
    }
  }, [employee.id, settingsName, settingsDesc, settingsAvatar, settingsAutonomy, fetchEmployee])

  return (
    <div className="px-5 max-w-lg space-y-4">
      <div className="space-y-2">
        <Label htmlFor="settings-name">Name</Label>
        <Input id="settings-name" value={settingsName} onChange={(e) => setSettingsName(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="settings-desc">Description</Label>
        <Textarea id="settings-desc" value={settingsDesc} onChange={(e) => setSettingsDesc(e.target.value)} rows={3} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="settings-avatar">Avatar</Label>
        <Input id="settings-avatar" value={settingsAvatar} onChange={(e) => setSettingsAvatar(e.target.value)} placeholder="🤖" />
      </div>
      <div className="space-y-2">
        <Label>Autonomy Level</Label>
        <Select value={settingsAutonomy} onValueChange={setSettingsAutonomy}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="supervised">Supervised</SelectItem>
            <SelectItem value="autonomous">Autonomous</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button onClick={handleSave} disabled={isSaving}>
        {isSaving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
        Save Settings
      </Button>
    </div>
  )
}

type ToolsSkillsFilter = "all" | "tools" | "skills" | "clawhub"

function ToolsSkillsCombined(props: {
  employee: TabSettingsProps["employee"]
  allPlatformTools: TabSettingsProps["allPlatformTools"]
  customTools: TabSettingsProps["customTools"]
  toolsLoading: boolean
  enabledToolIds: Set<string>
  onToggleAssistantTool: (id: string) => Promise<void>
  toggleCustomTool: (id: string, enabled: boolean) => Promise<void>
  deleteCustomTool: (id: string) => Promise<void>
  onCreateToolOpen: () => void
  skills: TabSettingsProps["skills"]
  allPlatformSkills: TabSettingsProps["allPlatformSkills"]
  skillsLoading: boolean
  enabledSkillIds: Set<string>
  onToggleAssistantSkill: (id: string) => Promise<void>
  toggleSkill: (id: string, enabled: boolean) => Promise<void>
  installSkill: (slug: string) => Promise<unknown>
  uninstallSkill: (id: string) => Promise<void>
  autoRedeploy: () => Promise<void>
}) {
  const [filter, setFilter] = useState<ToolsSkillsFilter>("all")

  const filters: { value: ToolsSkillsFilter; label: string; count: number }[] = [
    { value: "all", label: "All", count: props.allPlatformTools.length + props.allPlatformSkills.length + props.customTools.length + props.skills.clawhub.length },
    { value: "tools", label: "Tools", count: props.allPlatformTools.length + props.customTools.length },
    { value: "skills", label: "Skills", count: props.allPlatformSkills.length },
    { value: "clawhub", label: "ClawHub", count: props.skills.clawhub.length },
  ]

  const showTools = filter === "all" || filter === "tools"
  const showSkills = filter === "all" || filter === "skills"
  const showClawHub = filter === "all" || filter === "clawhub"

  return (
    <div className="px-2">
      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-3 px-3">
        {filters.map((f) => (
          <Button
            key={f.value}
            variant={filter === f.value ? "secondary" : "ghost"}
            size="sm"
            className="h-7 text-xs px-2"
            onClick={() => setFilter(f.value)}
          >
            {f.label}
            <span className="ml-1 text-muted-foreground">{f.count}</span>
          </Button>
        ))}
        {(filter === "all" || filter === "tools") && (
          <Button size="sm" variant="outline" className="h-7 text-xs ml-auto" onClick={props.onCreateToolOpen}>
            <Plus className="h-3 w-3 mr-1" />
            Custom Tool
          </Button>
        )}
      </div>

      {showTools && (
        <TabTools
          employeeName={props.employee.assistant.name}
          employeeEmoji={props.employee.assistant.emoji}
          allPlatformTools={props.allPlatformTools}
          customTools={props.customTools}
          toolsLoading={props.toolsLoading}
          enabledToolIds={props.enabledToolIds}
          onToggleAssistantTool={props.onToggleAssistantTool}
          toggleCustomTool={props.toggleCustomTool}
          deleteCustomTool={props.deleteCustomTool}
          onCreateToolOpen={props.onCreateToolOpen}
          autoRedeploy={props.autoRedeploy}
        />
      )}
      {showSkills && (
        <TabSkills
          employeeId={props.employee.id}
          employeeName={props.employee.assistant.name}
          employeeEmoji={props.employee.assistant.emoji}
          skills={props.skills}
          allPlatformSkills={props.allPlatformSkills}
          skillsLoading={props.skillsLoading}
          enabledSkillIds={props.enabledSkillIds}
          onToggleAssistantSkill={props.onToggleAssistantSkill}
          toggleSkill={props.toggleSkill}
          installSkill={props.installSkill}
          uninstallSkill={props.uninstallSkill}
          autoRedeploy={props.autoRedeploy}
        />
      )}
      {showClawHub && !showSkills && (
        <div className="px-5 py-4 text-center text-xs text-muted-foreground">
          ClawHub skills are shown within the Skills section. Select &quot;Skills&quot; or &quot;All&quot; to manage them.
        </div>
      )}
    </div>
  )
}

function SettingsDanger({
  onArchiveOpen,
  onDeleteOpen,
}: {
  onArchiveOpen: () => void
  onDeleteOpen: () => void
}) {
  return (
    <div className="px-5 max-w-lg space-y-3">
      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <div>
          <p className="text-sm font-medium">Archive Employee</p>
          <p className="text-xs text-muted-foreground">Stop all tasks and set status to archived.</p>
        </div>
        <Button variant="outline" size="sm" onClick={onArchiveOpen}>Archive</Button>
      </div>
      <div className="flex items-center justify-between rounded-lg border border-destructive/50 p-3">
        <div>
          <p className="text-sm font-medium">Delete Employee</p>
          <p className="text-xs text-muted-foreground">Permanently delete. This cannot be undone.</p>
        </div>
        <Button variant="destructive" size="sm" onClick={onDeleteOpen}>
          <Trash2 className="h-4 w-4 mr-1.5" />
          Delete
        </Button>
      </div>
    </div>
  )
}
