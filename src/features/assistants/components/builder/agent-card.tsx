"use client"

import { useMemo } from "react"
import { MoreHorizontal, Star, Copy, Trash2, Wrench, Database, Eye } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn, getTagColor } from "@/lib/utils"
import { getModelName, getModelById } from "@/lib/models"
import { SpotlightCard } from "@/components/reactbits/spotlight-card"
import type { Assistant } from "@/lib/types/assistant"

const MAX_VISIBLE_BADGES = 4

interface AgentCardProps {
  agent: Assistant
  isDefault: boolean
  onClick: () => void
  onDuplicate: () => void
  onSetDefault: () => void
  onDelete: () => void
}

interface BadgeItem {
  key: string
  variant: "secondary" | "outline"
  className: string
  style?: React.CSSProperties
  icon?: React.ReactNode
  label: string
}

export function AgentCard({
  agent,
  isDefault,
  onClick,
  onDuplicate,
  onSetDefault,
  onDelete,
}: AgentCardProps) {
  const model = agent.model ? getModelById(agent.model) : null
  const modelName = agent.model ? getModelName(agent.model) : "Default"
  const hasTools = (agent.toolCount ?? 0) > 0
  const hasKB = agent.useKnowledgeBase

  const allBadges = useMemo(() => {
    const badges: BadgeItem[] = []
    badges.push({
      key: "model",
      variant: "secondary",
      className: "text-[10px] px-1.5 py-0 h-5 gap-1 shrink-0",
      label: model?.provider ? `${model.provider} ${modelName}` : modelName,
    })
    if (model?.capabilities.functionCalling) {
      badges.push({
        key: "tools-cap",
        variant: "outline",
        className: "text-[10px] px-1.5 py-0 h-5 gap-0.5 shrink-0",
        icon: <Wrench className="h-2.5 w-2.5" />,
        label: "Tools",
      })
    }
    if (model?.capabilities.vision) {
      badges.push({
        key: "vision",
        variant: "outline",
        className: "text-[10px] px-1.5 py-0 h-5 gap-0.5 shrink-0",
        icon: <Eye className="h-2.5 w-2.5" />,
        label: "Vision",
      })
    }
    if (hasTools) {
      badges.push({
        key: "tools-count",
        variant: "outline",
        className: "text-[10px] px-1.5 py-0 h-5 gap-0.5 text-blue-600 border-blue-200 shrink-0",
        icon: <Wrench className="h-2.5 w-2.5" />,
        label: String(agent.toolCount),
      })
    }
    if (hasKB) {
      badges.push({
        key: "kb",
        variant: "outline",
        className: "text-[10px] px-1.5 py-0 h-5 gap-0.5 text-emerald-600 border-emerald-200 shrink-0",
        icon: <Database className="h-2.5 w-2.5" />,
        label: "KB",
      })
    }
    for (const tag of agent.tags ?? []) {
      badges.push({
        key: `tag-${tag}`,
        variant: "outline",
        className: "text-[10px] px-1.5 py-0 h-5 shrink-0",
        style: {
          borderColor: `${getTagColor(tag)}40`,
          color: getTagColor(tag),
        },
        label: tag,
      })
    }
    return badges
  }, [agent, model, modelName, hasTools, hasKB])

  const visibleBadges = allBadges.slice(0, MAX_VISIBLE_BADGES)
  const hiddenBadges = allBadges.slice(MAX_VISIBLE_BADGES)

  return (
    <TooltipProvider delayDuration={300}>
      <SpotlightCard
        className={cn(
          "group h-[140px] rounded-xl border bg-card cursor-pointer transition-all hover:shadow-md hover:border-primary/30",
          isDefault && "ring-1 ring-primary/20"
        )}
        spotlightColor="rgba(var(--primary-rgb, 124,58,237), 0.06)"
        onClick={onClick}
      >
        <div className="flex flex-col h-full p-4">
          {/* Top: emoji + name + menu */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-2xl shrink-0 leading-none">{agent.emoji}</span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold truncate">{agent.name}</h3>
                  {isDefault && (
                    <Star className="h-3.5 w-3.5 fill-chart-1 text-chart-1 shrink-0" />
                  )}
                </div>
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onClick={onDuplicate}>
                  <Copy className="mr-2 h-4 w-4" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onSetDefault}>
                  <Star className="mr-2 h-4 w-4" />
                  {isDefault ? "Remove Default" : "Set as Default"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={onDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Middle: description - fills available space */}
          <p className="text-xs text-muted-foreground/80 leading-relaxed line-clamp-2 flex-1">
            {agent.description || "No description"}
          </p>

          {/* Bottom: badges - anchored to bottom */}
          <div className="flex items-center gap-2 pt-2.5 border-t border-border/40 mt-auto">
            {visibleBadges.map((b) => (
              <Badge
                key={b.key}
                variant={b.variant}
                className={b.className}
                style={b.style}
              >
                {b.icon}
                {b.label}
              </Badge>
            ))}
            {hiddenBadges.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-[10px] text-muted-foreground font-medium shrink-0 cursor-default">
                    +{hiddenBadges.length}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="flex flex-wrap gap-1 max-w-[240px]">
                  {hiddenBadges.map((b) => (
                    <Badge
                      key={b.key}
                      variant={b.variant}
                      className={b.className}
                      style={b.style}
                    >
                      {b.icon}
                      {b.label}
                    </Badge>
                  ))}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </SpotlightCard>
    </TooltipProvider>
  )
}
