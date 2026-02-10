"use client"

import { MoreHorizontal, Star, Copy, Trash2, Wrench, Database, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { getModelName, getModelById } from "@/lib/models"
import type { Assistant } from "@/lib/types/assistant"

interface AgentCardProps {
  agent: Assistant
  isDefault: boolean
  onClick: () => void
  onDuplicate: () => void
  onSetDefault: () => void
  onDelete: () => void
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

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-3 rounded-xl border bg-card p-4 cursor-pointer transition-all hover:shadow-md hover:border-primary/30",
        isDefault && "ring-1 ring-primary/20"
      )}
      onClick={onClick}
    >
      {/* Top row: emoji + name + actions */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-3xl shrink-0">{agent.emoji}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold truncate">{agent.name}</h3>
              {isDefault && (
                <Star className="h-3.5 w-3.5 fill-chart-1 text-chart-1 shrink-0" />
              )}
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
              {agent.description || "No description"}
            </p>
          </div>
        </div>

        {/* Quick actions dropdown */}
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

      {/* Badges row */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 gap-1">
          {model?.provider && (
            <span className="text-muted-foreground">{model.provider}</span>
          )}
          {modelName}
        </Badge>
        {model?.capabilities.functionCalling && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 gap-0.5">
            <Wrench className="h-2.5 w-2.5" />
            Tools
          </Badge>
        )}
        {model?.capabilities.vision && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 gap-0.5">
            <Eye className="h-2.5 w-2.5" />
            Vision
          </Badge>
        )}
        {hasTools && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 gap-0.5 text-blue-600 border-blue-200">
            <Wrench className="h-2.5 w-2.5" />
            {agent.toolCount}
          </Badge>
        )}
        {hasKB && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 gap-0.5 text-emerald-600 border-emerald-200">
            <Database className="h-2.5 w-2.5" />
            KB
          </Badge>
        )}
      </div>
    </div>
  )
}
