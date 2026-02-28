"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import {
  Search,
  Sparkles,
  Check,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CircleDot,
  ShoppingCart,
  Store,
  Zap,
  SlidersHorizontal,
  X,
} from "@/lib/icons"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { cn } from "@/lib/utils"
import { DynamicIcon } from "@/components/ui/dynamic-icon"
import { useSkills, type SkillItem } from "@/hooks/use-skills"
import { useTools } from "@/hooks/use-tools"
import { useSkillsReadiness } from "@/hooks/use-skill-readiness"
import { MarketplacePickerSheet } from "./marketplace-picker-sheet"
import type { SkillReadiness, RequirementStatus } from "@/lib/skills/requirement-resolver"

const CATEGORY_LABELS: Record<string, string> = {
  general: "General",
  productivity: "Productivity",
  coding: "Development",
  writing: "Writing",
  communication: "Communication",
  data: "Data & Analytics",
  support: "Customer Support",
}

interface TabSkillsProps {
  selectedSkillIds: string[]
  onToggleSkill: (skillId: string, autoEnableToolIds?: string[]) => void
  selectedToolIds?: string[]
  onToggleTool?: (toolId: string) => void
  isNew: boolean
  assistantId?: string | null
}

function ReadinessDot({ level }: { level: SkillReadiness["level"] }) {
  const colorMap = {
    ready: "bg-green-500",
    partial: "bg-yellow-500",
    "needs-setup": "bg-red-500",
  }
  const titleMap = {
    ready: "All requirements met",
    partial: "Some requirements need setup",
    "needs-setup": "Requires additional tools",
  }
  return (
    <span
      className={cn("inline-block h-2 w-2 rounded-full shrink-0", colorMap[level])}
      title={titleMap[level]}
    />
  )
}

function RequirementStatusIcon({ status }: { status: RequirementStatus["status"] }) {
  if (status === "fulfilled")
    return <Check className="h-3 w-3 text-green-600 shrink-0" />
  if (status === "available")
    return <CircleDot className="h-3 w-3 text-yellow-600 shrink-0" />
  return <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />
}

function RequirementsPanel({
  readiness,
}: {
  readiness: SkillReadiness
}) {
  if (readiness.totalCount === 0) return null

  return (
    <div className="mt-2 space-y-1.5 border-t border-border/50 pt-2">
      <p className="text-[10px] font-medium text-muted-foreground">
        Requirements ({readiness.fulfilledCount}/{readiness.totalCount} met)
      </p>
      {readiness.requirements.map((req) => (
        <div
          key={`${req.category}-${req.requirement}`}
          className="flex items-center gap-2 text-[11px]"
        >
          <RequirementStatusIcon status={req.status} />
          <span className="text-muted-foreground">
            {req.bridge?.displayName || req.requirement}
          </span>
          {req.status === "available" && (
            <Badge
              variant="outline"
              className="text-[9px] px-1 py-0 text-yellow-700 border-yellow-300"
            >
              Enable on agent
            </Badge>
          )}
          {req.status === "missing" && req.bridge?.type === "marketplace" && (
            <Link
              href="/dashboard/settings/tools"
              className="text-[9px] text-primary hover:underline flex items-center gap-0.5"
              onClick={(e) => e.stopPropagation()}
            >
              <ShoppingCart className="h-2.5 w-2.5" />
              Install
            </Link>
          )}
          {req.status === "missing" && req.category === "env" && (
            <span className="text-[9px] text-muted-foreground/70">env var</span>
          )}
        </div>
      ))}
    </div>
  )
}

export function TabSkills({
  selectedSkillIds,
  onToggleSkill,
  selectedToolIds,
  onToggleTool,
  isNew,
  assistantId,
}: TabSkillsProps) {
  const { skills, isLoading, fetchSkills } = useSkills()
  const { tools: allTools } = useTools()
  const [search, setSearch] = useState("")
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set())
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())
  const [sortOption, setSortOption] = useState<"az" | "recent" | "selected">("recent")
  const [expandedReqs, setExpandedReqs] = useState<Set<string>>(new Set())
  const [marketplaceOpen, setMarketplaceOpen] = useState(false)
  const { readinessMap } = useSkillsReadiness(selectedSkillIds, assistantId ?? null)

  const skillCategories = useMemo(() => {
    const cats = new Set(skills.map((s) => s.category))
    return [...cats].sort()
  }, [skills])

  const allTags = useMemo(() => {
    const tags = new Set<string>()
    skills.forEach((s) => s.tags.forEach((tag) => tags.add(tag)))
    return [...tags].sort()
  }, [skills])

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  const toggleReqs = (skillId: string) => {
    setExpandedReqs((prev) => {
      const next = new Set(prev)
      if (next.has(skillId)) next.delete(skillId)
      else next.add(skillId)
      return next
    })
  }

  /** When selecting a skill, auto-enable its required/attached tools */
  const handleSkillToggle = (skillId: string) => {
    const isCurrentlySelected = selectedSkillIds.includes(skillId)

    if (isCurrentlySelected) {
      // Toggling OFF — just remove skill, keep tools
      onToggleSkill(skillId)
      return
    }

    // Toggling ON — collect tool IDs to auto-enable
    const skill = skills.find((s) => s.id === skillId)
    if (!skill) {
      onToggleSkill(skillId)
      return
    }

    const toolIdsToEnable = new Set<string>()
    const currentToolIds = selectedToolIds ?? []

    // 1. Related tools from the installed skill (community skills create tools on install)
    if (skill.relatedToolIds && skill.relatedToolIds.length > 0) {
      for (const tid of skill.relatedToolIds) {
        if (!currentToolIds.includes(tid)) toolIdsToEnable.add(tid)
      }
    }

    // 2. Explicitly attached tools from metadata
    const meta = skill.metadata as Record<string, unknown> | null
    const attachedToolIds = Array.isArray(meta?.toolIds) ? (meta.toolIds as string[]) : []
    for (const tid of attachedToolIds) {
      if (!currentToolIds.includes(tid)) toolIdsToEnable.add(tid)
    }

    // 3. Required tools from parsed requirements (match by tool name)
    const reqs = meta?.requirements as { tools?: string[] } | undefined
    if (reqs?.tools) {
      for (const reqToolName of reqs.tools) {
        const match = allTools.find((t) => t.name === reqToolName)
        if (match && !currentToolIds.includes(match.id)) {
          toolIdsToEnable.add(match.id)
        }
      }
    }

    // 4. Scan skill content for tool name references (fallback)
    if (toolIdsToEnable.size === 0 && skill.content) {
      for (const tool of allTools) {
        if (currentToolIds.includes(tool.id)) continue
        const namePattern = new RegExp(`\\b${tool.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i")
        if (namePattern.test(skill.content)) {
          toolIdsToEnable.add(tool.id)
        }
      }
    }

    // Pass skill toggle + tool IDs in one call so parent does one atomic state update
    onToggleSkill(skillId, toolIdsToEnable.size > 0 ? [...toolIdsToEnable] : undefined)
  }

  const activeFilterCount = selectedCategories.size + selectedTags.size
  const hasActiveFilters = search.trim().length > 0 || activeFilterCount > 0

  const clearAllFilters = () => {
    setSearch("")
    setSelectedCategories(new Set())
    setSelectedTags(new Set())
  }

  const filteredSkills = useMemo(() => {
    let result = [...skills]

    // Search
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (s) =>
          s.displayName.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q))
      )
    }

    // Category filter
    if (selectedCategories.size > 0) {
      result = result.filter((s) => selectedCategories.has(s.category))
    }

    // Tag filter
    if (selectedTags.size > 0) {
      result = result.filter((s) => s.tags.some((tag) => selectedTags.has(tag)))
    }

    // Sort
    if (sortOption === "az") {
      result.sort((a, b) => a.displayName.localeCompare(b.displayName))
    } else if (sortOption === "selected") {
      result.sort((a, b) => {
        const aSelected = selectedSkillIds.includes(a.id) ? 0 : 1
        const bSelected = selectedSkillIds.includes(b.id) ? 0 : 1
        return aSelected - bSelected
      })
    }

    return result
  }, [skills, search, selectedCategories, selectedTags, sortOption, selectedSkillIds])

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Agent Skills</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Skills are instruction-based capabilities that teach the agent specific behaviors.
          They are appended to the system prompt.
        </p>
      </div>

      {isNew && (
        <p className="text-xs text-amber-600 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          Save the agent first, then configure skills.
        </p>
      )}

      {/* Search + Filter + Sort + Actions */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search skills..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Filter popover */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5 shrink-0">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filter
              {activeFilterCount > 0 && (
                <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-[10px] font-medium text-background">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[240px] p-0">
            <Command>
              <CommandInput placeholder="Search filters..." />
              <CommandList className="max-h-[300px] overflow-y-auto">
                <CommandEmpty>No match found.</CommandEmpty>
                {skillCategories.length > 1 && (
                  <CommandGroup heading="Category">
                    {skillCategories.map((cat) => {
                      const active = selectedCategories.has(cat)
                      const label = CATEGORY_LABELS[cat] ?? cat
                      return (
                        <CommandItem
                          key={`cat-${cat}`}
                          value={`category: ${label}`}
                          onSelect={() => toggleCategory(cat)}
                          className="cursor-pointer"
                        >
                          <div
                            className={cn(
                              "h-4 w-4 rounded border shrink-0 mr-2 flex items-center justify-center",
                              active ? "border-primary bg-primary/10" : "border-border"
                            )}
                          >
                            {active && <Check className="h-3 w-3 text-primary" />}
                          </div>
                          <span className="truncate">{label}</span>
                        </CommandItem>
                      )
                    })}
                  </CommandGroup>
                )}
                {allTags.length > 0 && (
                  <>
                    <CommandSeparator />
                    <CommandGroup heading="Tags">
                      {allTags.map((tag) => {
                        const active = selectedTags.has(tag)
                        return (
                          <CommandItem
                            key={`tag-${tag}`}
                            value={`tag: ${tag}`}
                            onSelect={() => toggleTag(tag)}
                            className="cursor-pointer"
                          >
                            <div
                              className={cn(
                                "h-4 w-4 rounded border shrink-0 mr-2 flex items-center justify-center",
                                active ? "border-primary bg-primary/10" : "border-border"
                              )}
                            >
                              {active && <Check className="h-3 w-3 text-primary" />}
                            </div>
                            <span className="truncate">{tag}</span>
                          </CommandItem>
                        )
                      })}
                    </CommandGroup>
                  </>
                )}
                {activeFilterCount > 0 && (
                  <>
                    <CommandSeparator />
                    <CommandGroup>
                      <CommandItem
                        onSelect={() => { setSelectedCategories(new Set()); setSelectedTags(new Set()) }}
                        className="cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                        <span className="text-muted-foreground">Clear all filters</span>
                      </CommandItem>
                    </CommandGroup>
                  </>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Sort */}
        <Select value={sortOption} onValueChange={(v) => setSortOption(v as typeof sortOption)}>
          <SelectTrigger className="h-9 w-[140px] text-sm shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="recent">Recent</SelectItem>
            <SelectItem value="az">A &ndash; Z</SelectItem>
            <SelectItem value="selected">Selected first</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="sm"
          className="shrink-0 h-9"
          onClick={() => setMarketplaceOpen(true)}
          disabled={isNew}
        >
          <Store className="h-3.5 w-3.5 mr-1.5" />
          Marketplace
        </Button>
      </div>

      {/* Skills list */}
      <div className="space-y-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Loading skills...</p>
        ) : skills.length === 0 ? (
          <div className="text-center py-8">
            <Sparkles className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">No skills available yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Install skills from the Marketplace or create custom skills in Settings.
            </p>
          </div>
        ) : filteredSkills.length === 0 ? (
          <div className="text-center py-8">
            <Search className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">No skills match your filters</p>
            <button
              onClick={clearAllFilters}
              className="mt-2 text-xs font-medium text-foreground/70 hover:text-foreground transition-colors cursor-pointer"
            >
              Clear all filters
            </button>
          </div>
        ) : (
          <>
            {hasActiveFilters && (
              <p className="text-xs text-muted-foreground">
                Showing{" "}
                <span className="font-semibold text-foreground">{filteredSkills.length}</span>
                {" "}of {skills.length} skills
              </p>
            )}
            {filteredSkills.map((skill) => {
              const isSelected = selectedSkillIds.includes(skill.id)
              const readiness = readinessMap[skill.id]
              const hasReqs = readiness && readiness.totalCount > 0
              const isReqsExpanded = expandedReqs.has(skill.id)

              return (
                <div key={skill.id}>
                  <button
                    type="button"
                    onClick={() => handleSkillToggle(skill.id)}
                    disabled={isNew}
                    className={cn(
                      "flex items-start gap-4 p-4 rounded-lg text-left transition-all w-full border",
                      isSelected
                        ? "bg-primary/5 border-primary ring-1 ring-primary/20"
                        : "border-border hover:bg-muted/50",
                      isNew && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-lg shrink-0",
                        isSelected ? "bg-primary/10" : "bg-muted"
                      )}
                    >
                      <DynamicIcon
                        icon={skill.icon ?? undefined}
                        fallback={Sparkles}
                        className={cn("h-4 w-4", isSelected ? "text-primary" : "text-muted-foreground")}
                        emojiClassName="text-lg"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{skill.displayName}</span>
                        {(skill.source === "marketplace" || skill.source === "openclaw") && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            Marketplace
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {CATEGORY_LABELS[skill.category] ?? skill.category}
                        </Badge>
                        {skill.assistantCount > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            {skill.assistantCount} agent{skill.assistantCount !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {skill.description}
                      </p>
                      {skill.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {skill.tags.map((tag) => (
                            <Badge
                              key={tag}
                              variant="outline"
                              className="text-[10px] px-1.5 py-0"
                            >
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {/* Expandable requirements panel */}
                      {isSelected && hasReqs && readiness.level !== "ready" && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleReqs(skill.id)
                          }}
                          className="flex items-center gap-1 mt-2 text-[10px] text-primary hover:underline"
                        >
                          <Zap className="h-2.5 w-2.5" />
                          {readiness.fulfilledCount} of {readiness.totalCount} requirements met
                          {isReqsExpanded ? (
                            <ChevronDown className="h-2.5 w-2.5" />
                          ) : (
                            <ChevronRight className="h-2.5 w-2.5" />
                          )}
                        </button>
                      )}
                      {isSelected && hasReqs && isReqsExpanded && (
                        <RequirementsPanel readiness={readiness} />
                      )}
                    </div>
                    <div className="shrink-0 mt-1">
                      <div
                        className={cn(
                          "h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors",
                          isSelected
                            ? "border-primary bg-primary"
                            : "border-muted-foreground/30"
                        )}
                      >
                        {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                      </div>
                    </div>
                  </button>
                </div>
              )
            })}
          </>
        )}
      </div>

      {selectedSkillIds.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {selectedSkillIds.length} skill{selectedSkillIds.length !== 1 ? "s" : ""} enabled
        </p>
      )}

      <Button variant="link" size="sm" className="px-0 text-xs" asChild>
        <Link href="/dashboard/settings/skills">
          Manage Skills
          <ExternalLink className="ml-1 h-3 w-3" />
        </Link>
      </Button>

      {/* Marketplace Picker Sheet */}
      <MarketplacePickerSheet
        open={marketplaceOpen}
        onOpenChange={setMarketplaceOpen}
        type="skill"
        boundItemIds={selectedSkillIds}
        onItemInstalled={(result) => {
          fetchSkills()
          const skillId = result.skillId || result.installedId
          if (skillId && !selectedSkillIds.includes(skillId)) {
            onToggleSkill(skillId)
          }
          // Auto-bind tools that come with the skill
          if (result.toolIds && onToggleTool && selectedToolIds) {
            for (const toolId of result.toolIds) {
              if (!selectedToolIds.includes(toolId)) {
                onToggleTool(toolId)
              }
            }
          }
        }}
        onExistingItemAdded={(skillId) => {
          if (!selectedSkillIds.includes(skillId)) onToggleSkill(skillId)
        }}
      />
    </div>
  )
}
