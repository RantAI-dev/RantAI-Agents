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
  Zap,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useSkills, type SkillItem } from "@/hooks/use-skills"
import { useSkillsReadiness } from "@/hooks/use-skill-readiness"
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
  onToggleSkill: (skillId: string) => void
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
  isNew,
  assistantId,
}: TabSkillsProps) {
  const { skills, isLoading, fetchSkills } = useSkills()
  const [search, setSearch] = useState("")
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [expandedReqs, setExpandedReqs] = useState<Set<string>>(new Set())
  // Fetch readiness for all selected skills
  const { readinessMap } = useSkillsReadiness(selectedSkillIds, assistantId ?? null)

  const toggleCategory = (cat: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
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

  const grouped = useMemo(() => {
    const q = search.toLowerCase()
    const filtered = q
      ? skills.filter(
          (s) =>
            s.displayName.toLowerCase().includes(q) ||
            s.name.toLowerCase().includes(q) ||
            s.description.toLowerCase().includes(q) ||
            s.tags.some((t) => t.toLowerCase().includes(q))
        )
      : skills

    const groups: Record<string, SkillItem[]> = {}
    for (const skill of filtered) {
      const cat = skill.category || "general"
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(skill)
    }
    return groups
  }, [skills, search])

  const categories = Object.keys(grouped).sort()

  return (
    <div className="p-6 max-w-3xl space-y-6">
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

      {/* Actions */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search skills..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        <Button variant="outline" size="sm" className="shrink-0" asChild>
          <Link href="/dashboard/settings/skills">
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            Browse Marketplace
          </Link>
        </Button>
      </div>

      {/* Skill Groups */}
      <div className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Loading skills...</p>
        ) : skills.length === 0 ? (
          <div className="text-center py-8 space-y-3">
            <Sparkles className="h-8 w-8 mx-auto text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No skills available yet</p>
            <p className="text-xs text-muted-foreground">
              Install skills from the Marketplace or create custom skills in Settings.
            </p>
          </div>
        ) : categories.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No skills match your search</p>
        ) : (
          categories.map((category) => {
            const label = CATEGORY_LABELS[category] || category
            const isCollapsed = collapsed.has(category)
            const catSkills = grouped[category]

            return (
              <div key={category}>
                <button
                  type="button"
                  className="flex items-center gap-2 w-full text-left py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => toggleCategory(category)}
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                  <Sparkles className="h-3.5 w-3.5" />
                  {label}
                  <span className="text-[10px] font-normal">({catSkills.length})</span>
                </button>

                {!isCollapsed && (
                  <div className="grid grid-cols-1 gap-2 mt-2 ml-6">
                    {catSkills.map((skill) => {
                      const isSelected = selectedSkillIds.includes(skill.id)
                      const readiness = readinessMap[skill.id]
                      const hasReqs = readiness && readiness.totalCount > 0
                      const isReqsExpanded = expandedReqs.has(skill.id)

                      return (
                        <div key={skill.id}>
                          <button
                            type="button"
                            onClick={() => onToggleSkill(skill.id)}
                            disabled={isNew}
                            className={cn(
                              "flex items-start gap-3 p-3 rounded-lg text-sm text-left transition-colors w-full",
                              isSelected
                                ? "bg-primary/10 border border-primary"
                                : "border border-border hover:bg-muted/50",
                              isNew && "opacity-50 cursor-not-allowed"
                            )}
                          >
                            <div
                              className={cn(
                                "h-5 w-5 rounded flex items-center justify-center shrink-0 mt-0.5",
                                isSelected ? "bg-primary" : "bg-muted"
                              )}
                            >
                              {isSelected ? (
                                <Check className="h-3 w-3 text-white" />
                              ) : (
                                <Sparkles className="h-3 w-3 text-muted-foreground" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{skill.displayName}</span>
                                {(skill.source === "marketplace" || skill.source === "openclaw") && (
                                  <Badge variant="secondary" className="text-[10px] px-1 py-0">
                                    Marketplace
                                  </Badge>
                                )}
                                {isSelected && readiness && (
                                  <ReadinessDot level={readiness.level} />
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {skill.description}
                              </p>
                              {skill.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {skill.tags.slice(0, 3).map((tag) => (
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
                                  className="flex items-center gap-1 mt-1.5 text-[10px] text-primary hover:underline"
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
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
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

    </div>
  )
}
