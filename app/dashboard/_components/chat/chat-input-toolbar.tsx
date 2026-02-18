"use client"

import { memo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Plus,
  Globe,
  Wrench,
  Package,
  Plug,
  WrenchIcon,
  Upload,
  BookOpen,
  Github,
  ChevronDown,
  LayoutPanelLeft,
  Code,
  Check,
  Sparkles,
  X,
} from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { TYPE_ICONS, TYPE_LABELS, TYPE_COLORS } from "./artifacts/constants"
import type { Artifact, ArtifactType } from "./artifacts/types"

export type CanvasMode = false | "auto" | ArtifactType

export interface AssistantToolInfo {
  name: string
  displayName: string
  description: string
  category: string
}

export interface KBGroup {
  id: string
  name: string
  color: string | null
  documentCount: number
}

interface ChatInputToolbarProps {
  onFileSelect: (file: File) => void
  fileAttached: boolean
  webSearchEnabled: boolean
  onToggleWebSearch: () => void
  knowledgeBaseGroupIds: string[]
  onKBGroupsChange: (groupIds: string[]) => void
  kbGroups: KBGroup[]
  toolsEnabled: boolean
  onToggleTools: () => void
  assistantTools: AssistantToolInfo[]
  onImportGithub: () => void
  canvasMode: CanvasMode
  onSetCanvasMode: (mode: CanvasMode) => void
  artifacts: Map<string, Artifact>
  activeArtifactId: string | null
  onOpenArtifact: (id: string) => void
  onCloseArtifact: () => void
  disabled: boolean
}

const SUPPORTED_EXTENSIONS = ".png,.jpg,.jpeg,.gif,.webp,.pdf,.md,.txt"

const CATEGORY_ICONS: Record<string, typeof Package> = {
  builtin: Package,
  custom: WrenchIcon,
  mcp: Plug,
}

const ARTIFACT_TYPES: ArtifactType[] = [
  "text/html",
  "application/react",
  "image/svg+xml",
  "application/mermaid",
  "text/markdown",
  "application/code",
  "application/sheet",
  "text/latex",
  "application/slides",
  "application/python",
]

function getCanvasLabel(mode: CanvasMode): string {
  if (mode === false) return "Canvas: Off"
  if (mode === "auto") return "Canvas: Auto"
  return `Canvas: ${TYPE_LABELS[mode] || mode}`
}

export const ChatInputToolbar = memo<ChatInputToolbarProps>(({
  onFileSelect,
  fileAttached,
  webSearchEnabled,
  onToggleWebSearch,
  knowledgeBaseGroupIds,
  onKBGroupsChange,
  kbGroups,
  toolsEnabled,
  onToggleTools,
  assistantTools,
  onImportGithub,
  canvasMode,
  onSetCanvasMode,
  artifacts,
  activeArtifactId,
  onOpenArtifact,
  onCloseArtifact,
  disabled,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [kbOpen, setKBOpen] = useState(false)
  const toolCount = assistantTools.length
  const artifactCount = artifacts.size
  const kbCount = knowledgeBaseGroupIds.length

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onFileSelect(file)
    e.target.value = ""
  }

  const handleKBToggle = (groupId: string, checked: boolean) => {
    if (checked) {
      onKBGroupsChange([...knowledgeBaseGroupIds, groupId])
    } else {
      onKBGroupsChange(knowledgeBaseGroupIds.filter((id) => id !== groupId))
    }
  }

  return (
    <div className="flex items-center gap-0.5">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={SUPPORTED_EXTENSIONS}
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
      />

      {/* "+" Add menu (Google-style) */}
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  "h-8 w-8 rounded-lg transition-colors text-muted-foreground hover:text-foreground relative",
                  (fileAttached || kbCount > 0) &&
                    "bg-primary/10 text-primary hover:bg-primary/20"
                )}
                disabled={disabled}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>Add attachments</p>
          </TooltipContent>
        </Tooltip>
        <PopoverContent side="top" align="start" className="w-64 p-1.5">
          {/* Upload files */}
          <button
            type="button"
            className="flex items-center gap-2.5 w-full text-left text-sm px-2.5 py-2 rounded-md hover:bg-accent transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4 text-muted-foreground" />
            <span>Upload files</span>
            {fileAttached && (
              <span className="ml-auto h-2 w-2 rounded-full bg-primary" />
            )}
          </button>

          {/* Knowledge base picker */}
          <Collapsible open={kbOpen} onOpenChange={setKBOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex items-center gap-2.5 w-full text-left text-sm px-2.5 py-2 rounded-md hover:bg-accent transition-colors",
                  kbCount > 0 && "text-primary"
                )}
              >
                <BookOpen className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1">Knowledge base</span>
                {kbCount > 0 && (
                  <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">
                    {kbCount}
                  </Badge>
                )}
                <ChevronDown className={cn(
                  "h-3 w-3 text-muted-foreground transition-transform",
                  kbOpen && "rotate-180"
                )} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="pl-9 pr-2 py-1 space-y-0.5 max-h-[160px] overflow-y-auto">
                {kbGroups.length > 0 ? (
                  kbGroups.map((group) => (
                    <label
                      key={group.id}
                      className="flex items-center gap-2 text-xs py-1.5 cursor-pointer rounded px-1 hover:bg-accent/50"
                    >
                      <Checkbox
                        checked={knowledgeBaseGroupIds.includes(group.id)}
                        onCheckedChange={(checked) => handleKBToggle(group.id, !!checked)}
                      />
                      {group.color && (
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: group.color }}
                        />
                      )}
                      <span className="flex-1 truncate">{group.name}</span>
                      <span className="text-muted-foreground text-[10px]">{group.documentCount}</span>
                    </label>
                  ))
                ) : (
                  <p className="text-[11px] text-muted-foreground py-2">
                    No knowledge base groups found
                  </p>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Import code from GitHub */}
          <button
            type="button"
            className="flex items-center gap-2.5 w-full text-left text-sm px-2.5 py-2 rounded-md hover:bg-accent transition-colors"
            onClick={onImportGithub}
          >
            <Github className="h-4 w-4 text-muted-foreground" />
            <span>Import code</span>
          </button>
        </PopoverContent>
      </Popover>

      {/* Web search toggle */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8 rounded-lg transition-colors",
              webSearchEnabled
                ? "bg-primary/10 text-primary hover:bg-primary/20"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={onToggleWebSearch}
            disabled={disabled}
          >
            <Globe className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>{webSearchEnabled ? "Web search enabled" : "Enable web search"}</p>
        </TooltipContent>
      </Tooltip>

      {/* Tools toggle + popover */}
      {toolCount > 0 && (
        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-8 w-8 rounded-lg transition-colors relative",
                    toolsEnabled
                      ? "bg-primary/10 text-primary hover:bg-primary/20"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  disabled={disabled}
                >
                  <Wrench className="h-4 w-4" />
                  <span className={cn(
                    "absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full text-[9px] flex items-center justify-center font-medium",
                    toolsEnabled
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted-foreground/30 text-muted-foreground"
                  )}>
                    {toolCount}
                  </span>
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>{toolsEnabled ? `${toolCount} tool${toolCount !== 1 ? "s" : ""} active` : "Tools disabled"}</p>
            </TooltipContent>
          </Tooltip>
          <PopoverContent side="top" align="start" className="w-72 p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground">
                Tools ({toolCount})
              </p>
              <Button
                type="button"
                variant={toolsEnabled ? "default" : "outline"}
                size="sm"
                className="h-6 text-[10px] px-2"
                onClick={onToggleTools}
              >
                {toolsEnabled ? "Enabled" : "Disabled"}
              </Button>
            </div>
            <div className={cn(
              "space-y-2 max-h-[240px] overflow-y-auto transition-opacity",
              !toolsEnabled && "opacity-40"
            )}>
              {assistantTools.map((tool) => {
                const CatIcon = CATEGORY_ICONS[tool.category] || Package
                return (
                  <div key={tool.name} className="flex items-start gap-2 text-sm">
                    <CatIcon className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-xs">{tool.displayName}</span>
                        <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3.5">
                          {tool.category}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-2">
                        {tool.description}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/* Canvas / Artifacts dropdown */}
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  "h-8 w-8 rounded-lg transition-colors relative",
                  canvasMode
                    ? "bg-primary/10 text-primary hover:bg-primary/20"
                    : "text-muted-foreground hover:text-foreground"
                )}
                disabled={disabled}
              >
                <LayoutPanelLeft className="h-4 w-4" />
                {artifactCount > 0 && (
                  <span className={cn(
                    "absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full text-[9px] flex items-center justify-center font-medium",
                    canvasMode
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted-foreground/30 text-muted-foreground"
                  )}>
                    {artifactCount}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>{getCanvasLabel(canvasMode)}</p>
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent side="top" align="end" className="w-56">
          {/* Off */}
          <DropdownMenuItem onClick={() => onSetCanvasMode(false)}>
            <X className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
            <span className="flex-1">Off</span>
            {canvasMode === false && <Check className="h-3.5 w-3.5 text-primary" />}
          </DropdownMenuItem>

          {/* Auto */}
          <DropdownMenuItem onClick={() => onSetCanvasMode("auto")}>
            <Sparkles className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
            <span className="flex-1">Auto</span>
            <span className="text-[10px] text-muted-foreground mr-2">AI decides</span>
            {canvasMode === "auto" && <Check className="h-3.5 w-3.5 text-primary" />}
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[10px] text-muted-foreground font-normal">
            Artifact Type
          </DropdownMenuLabel>

          {/* Type items */}
          {ARTIFACT_TYPES.map((type) => {
            const Icon = TYPE_ICONS[type]
            const colorClass = TYPE_COLORS[type].split(" ")[0] // just the text color
            return (
              <DropdownMenuItem key={type} onClick={() => onSetCanvasMode(type)}>
                <Icon className={cn("h-3.5 w-3.5 mr-2", colorClass)} />
                <span className="flex-1">{TYPE_LABELS[type]}</span>
                {canvasMode === type && <Check className="h-3.5 w-3.5 text-primary" />}
              </DropdownMenuItem>
            )
          })}

          {/* Existing artifacts */}
          {artifactCount > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] text-muted-foreground font-normal">
                Artifacts ({artifactCount})
              </DropdownMenuLabel>
              {Array.from(artifacts.values()).map((artifact) => {
                const Icon = TYPE_ICONS[artifact.type] || Code
                const isActive = artifact.id === activeArtifactId
                return (
                  <DropdownMenuItem
                    key={artifact.id}
                    className={cn(isActive && "bg-primary/10 text-primary")}
                    onClick={() => {
                      if (isActive) {
                        onCloseArtifact()
                      } else {
                        onOpenArtifact(artifact.id)
                      }
                    }}
                  >
                    <Icon className="h-3.5 w-3.5 mr-2 shrink-0" />
                    <span className="flex-1 truncate text-xs">{artifact.title}</span>
                    <span className="text-[10px] text-muted-foreground">v{artifact.version}</span>
                    {isActive && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 ml-1" />}
                  </DropdownMenuItem>
                )
              })}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
})

ChatInputToolbar.displayName = "ChatInputToolbar"
