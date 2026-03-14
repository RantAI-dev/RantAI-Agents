"use client"

import { useState, useCallback, useEffect, useRef, useMemo } from "react"
import {
  Search, X, Sparkles, Check, Plus, Loader2, Trash2, Package, Download, Star,
} from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { DynamicIcon } from "@/components/ui/dynamic-icon"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import type { SkillItem } from "@/hooks/use-skills"

interface PlatformSkillItem {
  id: string
  name: string
  description: string
  source: string
  enabled: boolean
  icon: string
  category: string
  tags: string[]
}

interface ClawHubSkillItem {
  id: string
  name: string
  slug: string
  version: string
  description: string | null
  enabled: boolean
  createdAt: string
}

interface ClawHubSearchResult {
  slug: string
  name: string
  description: string
  author: string
  downloads?: number
  rating?: number
  installs?: number
}

interface TabSkillsProps {
  employeeId: string
  employeeName: string
  employeeEmoji: string
  skills: { platform: PlatformSkillItem[]; clawhub: ClawHubSkillItem[] }
  allPlatformSkills: SkillItem[]
  skillsLoading: boolean
  enabledSkillIds: Set<string>
  onToggleAssistantSkill: (skillId: string) => Promise<void>
  toggleSkill: (skillId: string, enabled: boolean) => Promise<void>
  installSkill: (slug: string) => Promise<unknown>
  uninstallSkill: (skillId: string) => Promise<void>
}

export function TabSkills({
  employeeId,
  employeeName,
  employeeEmoji,
  skills,
  allPlatformSkills,
  skillsLoading,
  enabledSkillIds,
  onToggleAssistantSkill,
  toggleSkill,
  installSkill,
  uninstallSkill,
}: TabSkillsProps) {
  const [skillSearch, setSkillSearch] = useState("")
  const [clawHubQuery, setClawHubQuery] = useState("")
  const [clawHubResults, setClawHubResults] = useState<ClawHubSearchResult[]>([])
  const [clawHubSearching, setClawHubSearching] = useState(false)
  const [clawHubLoaded, setClawHubLoaded] = useState(false)
  const [installingSlug, setInstallingSlug] = useState<string | null>(null)

  const installedClawHubSlugs = useMemo(
    () => new Set(skills.clawhub.map((s) => s.slug)),
    [skills.clawhub]
  )

  // Load top-rated ClawHub skills on mount
  useEffect(() => {
    if (clawHubLoaded) return
    setClawHubLoaded(true)
    setClawHubSearching(true)
    fetch(`/api/dashboard/digital-employees/${employeeId}/skills/search`)
      .then((r) => r.ok ? r.json() : { results: [] })
      .then((data) => setClawHubResults(data.results || []))
      .catch(() => setClawHubResults([]))
      .finally(() => setClawHubSearching(false))
  }, [clawHubLoaded, employeeId])

  // Debounced ClawHub search
  const clawHubSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fetchClawHub = useCallback(async (query: string) => {
    try {
      const url = query.trim()
        ? `/api/dashboard/digital-employees/${employeeId}/skills/search?q=${encodeURIComponent(query.trim())}`
        : `/api/dashboard/digital-employees/${employeeId}/skills/search`
      const res = await fetch(url)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setClawHubResults(data.results || [])
    } catch {
      setClawHubResults([])
    } finally {
      setClawHubSearching(false)
    }
  }, [employeeId])

  const handleClawHubSearch = useCallback((query: string) => {
    setClawHubQuery(query)
    if (clawHubSearchTimer.current) clearTimeout(clawHubSearchTimer.current)
    setClawHubSearching(true)
    clawHubSearchTimer.current = setTimeout(() => fetchClawHub(query), 300)
  }, [fetchClawHub])

  const handleInstallFromHub = useCallback(async (slug: string) => {
    setInstallingSlug(slug)
    try {
      await installSkill(slug)
      toast.success("Skill installed")
    } catch {
      toast.error("Failed to install skill")
    } finally {
      setInstallingSlug(null)
    }
  }, [installSkill])

  return (
    <div className="flex-1 overflow-auto p-5 space-y-6">
      {/* Platform Skills */}
      <div>
        <h2 className="text-sm font-medium mb-1">Platform Skills</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Toggle skills to enable/disable on {employeeEmoji} {employeeName}.
        </p>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search skills..."
            value={skillSearch}
            onChange={(e) => setSkillSearch(e.target.value)}
            className="pl-8 h-9"
          />
          {skillSearch && (
            <button
              onClick={() => setSkillSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {skillsLoading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Loading skills...</p>
        ) : (() => {
          const q = skillSearch.toLowerCase()
          const filtered = allPlatformSkills.filter(
            (s) => !q || s.displayName.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
          )
          return filtered.length === 0 ? (
            <div className="text-center py-6 border border-dashed rounded-md">
              <Sparkles className="h-6 w-6 mx-auto text-muted-foreground/40 mb-1.5" />
              <p className="text-xs text-muted-foreground">{skillSearch ? "No skills match your search" : "No skills available"}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((skill) => {
                const isEnabled = enabledSkillIds.has(skill.id)
                return (
                  <button
                    key={skill.id}
                    type="button"
                    onClick={() => onToggleAssistantSkill(skill.id)}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-lg text-left transition-all w-full border",
                      isEnabled
                        ? "bg-primary/5 border-primary ring-1 ring-primary/20"
                        : "border-border hover:bg-muted/50"
                    )}
                  >
                    <div className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg shrink-0",
                      isEnabled ? "bg-primary/10" : "bg-muted"
                    )}>
                      <DynamicIcon
                        icon={skill.icon ?? undefined}
                        fallback={Sparkles}
                        className={cn("h-4 w-4", isEnabled ? "text-primary" : "text-muted-foreground")}
                        emojiClassName="text-base"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{skill.displayName}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{skill.source}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{skill.description}</p>
                    </div>
                    <div className="shrink-0 mt-1">
                      <div className={cn(
                        "h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors",
                        isEnabled ? "border-primary bg-primary" : "border-muted-foreground/30"
                      )}>
                        {isEnabled && <Check className="h-3 w-3 text-primary-foreground" />}
                      </div>
                    </div>
                  </button>
                )
              })}
              <p className="text-xs text-muted-foreground">
                {enabledSkillIds.size} skill{enabledSkillIds.size !== 1 ? "s" : ""} enabled
              </p>
            </div>
          )
        })()}
      </div>

      <div className="h-px bg-border" />

      {/* ClawHub Skills */}
      <div>
        <h3 className="text-sm font-medium mb-3">ClawHub Skills</h3>
        <p className="text-xs text-muted-foreground mb-4">Browse and install community skills from ClawHub.</p>

        {skills.clawhub.length > 0 && (
          <div className="space-y-2 mb-4">
            {skills.clawhub.map((skill) => (
              <div key={skill.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                <span className="text-lg shrink-0">🐾</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{skill.name}</span>
                    {skill.version && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">v{skill.version}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{skill.slug}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch
                    checked={skill.enabled}
                    onCheckedChange={async (checked) => {
                      try {
                        await toggleSkill(skill.id, checked)
                      } catch {
                        toast.error("Failed to toggle skill")
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    onClick={async () => {
                      try {
                        await uninstallSkill(skill.id)
                        toast.success("Skill uninstalled")
                      } catch {
                        toast.error("Failed to uninstall skill")
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {skills.clawhub.length === 0 && (
          <p className="text-xs text-muted-foreground py-4 text-center border border-dashed rounded-md mb-4">No ClawHub skills installed</p>
        )}

        {/* Search ClawHub */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={clawHubQuery}
            onChange={(e) => handleClawHubSearch(e.target.value)}
            placeholder="Search ClawHub skills..."
            className="pl-8 h-9"
          />
          {clawHubQuery && (
            <button
              onClick={() => { setClawHubQuery(""); fetchClawHub("") }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {clawHubSearching && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="ml-2 text-xs text-muted-foreground">Searching ClawHub...</span>
          </div>
        )}

        {!clawHubSearching && clawHubQuery.trim() && clawHubResults.length === 0 && (
          <div className="text-center py-6 border border-dashed rounded-md">
            <Package className="h-6 w-6 mx-auto text-muted-foreground/40 mb-1.5" />
            <p className="text-xs text-muted-foreground">No skills found for &ldquo;{clawHubQuery}&rdquo;</p>
          </div>
        )}

        {!clawHubSearching && clawHubResults.length > 0 && (
          <div className="space-y-2">
            {!clawHubQuery.trim() && (
              <p className="text-xs font-medium text-muted-foreground mb-1">Top Rated</p>
            )}
            {clawHubResults.map((result) => {
              const isInstalled = installedClawHubSlugs.has(result.slug)
              const isInstalling = installingSlug === result.slug
              return (
                <div key={result.slug} className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                  <span className="text-lg shrink-0 mt-0.5">🐾</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{result.name}</span>
                      {result.author && (
                        <span className="text-[10px] text-muted-foreground">by {result.author}</span>
                      )}
                    </div>
                    {result.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{result.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5">
                      {result.downloads != null && (
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Download className="h-3 w-3" />
                          {result.downloads.toLocaleString()}
                        </span>
                      )}
                      {result.rating != null && (
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Star className="h-3 w-3" />
                          {result.rating.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 mt-0.5">
                    {isInstalled ? (
                      <Badge variant="secondary" className="text-[10px]">Installed</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={isInstalling}
                        onClick={() => handleInstallFromHub(result.slug)}
                      >
                        {isInstalling ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <>
                            <Plus className="h-3 w-3 mr-1" />
                            Install
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
