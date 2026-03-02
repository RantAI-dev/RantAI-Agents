"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import {
  Search,
  Wrench,
  Package,
  Users,
  Check,
  AlertTriangle,
  ExternalLink,
  Store,
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
import { DynamicIcon } from "@/components/ui/dynamic-icon"
import { cn } from "@/lib/utils"
import { useTools, type ToolItem } from "@/hooks/use-tools"
import { MarketplacePickerSheet } from "./marketplace-picker-sheet"

// Emoji icons for built-in tools — shown in the tool card
const BUILTIN_TOOL_ICONS: Record<string, string> = {
  knowledge_search: "📚",
  customer_lookup: "👥",
  channel_dispatch: "📤",
  document_analysis: "📄",
  file_operations: "📁",
  web_search: "🔍",
  calculator: "🧮",
  date_time: "⏰",
  json_transform: "🔄",
  text_utilities: "🔤",
  create_artifact: "🎨",
  update_artifact: "✏️",
}

const CATEGORY_LABELS: Record<string, string> = {
  builtin: "Built-in",
  custom: "Custom",
  community: "Community",
  openapi: "OpenAPI",
  mcp: "MCP",
}

interface TabToolsProps {
  selectedToolIds: string[]
  onToggleTool: (toolId: string) => void
  modelSupportsFunctionCalling: boolean
  isNew?: boolean
}

export function TabTools({
  selectedToolIds,
  onToggleTool,
  modelSupportsFunctionCalling,
}: TabToolsProps) {
  const { tools, isLoading, fetchTools } = useTools()
  const [search, setSearch] = useState("")
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set())
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())
  const [sortOption, setSortOption] = useState<"az" | "recent" | "selected">("recent")
  const [marketplaceOpen, setMarketplaceOpen] = useState(false)

  const toolCategories = useMemo(() => {
    const cats = new Set(tools.map((t) => t.category))
    return [...cats].sort()
  }, [tools])

  const allTags = useMemo(() => {
    const tags = new Set<string>()
    tools.forEach((t) => t.tags.forEach((tag) => tags.add(tag)))
    return [...tags].sort()
  }, [tools])

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

  const activeFilterCount = selectedCategories.size + selectedTags.size
  const hasActiveFilters = search.trim().length > 0 || activeFilterCount > 0

  const clearAllFilters = () => {
    setSearch("")
    setSelectedCategories(new Set())
    setSelectedTags(new Set())
  }

  const filteredTools = useMemo(() => {
    let result = [...tools]

    // Search
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (t) =>
          t.displayName.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q))
      )
    }

    // Category filter
    if (selectedCategories.size > 0) {
      result = result.filter((t) => selectedCategories.has(t.category))
    }

    // Tag filter
    if (selectedTags.size > 0) {
      result = result.filter((t) => t.tags.some((tag) => selectedTags.has(tag)))
    }

    // Sort
    if (sortOption === "az") {
      result.sort((a, b) => a.displayName.localeCompare(b.displayName))
    } else if (sortOption === "selected") {
      result.sort((a, b) => {
        const aSelected = selectedToolIds.includes(a.id) ? 0 : 1
        const bSelected = selectedToolIds.includes(b.id) ? 0 : 1
        return aSelected - bSelected
      })
    }

    return result
  }, [tools, search, selectedCategories, selectedTags, sortOption, selectedToolIds])

  const getToolIcon = (tool: ToolItem): string | undefined => {
    if (tool.icon) return tool.icon
    if (tool.category === "builtin") return BUILTIN_TOOL_ICONS[tool.name]
    return undefined
  }

  const categoryBadge = (category: string) => {
    switch (category) {
      case "builtin":
        return (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            <Package className="h-2.5 w-2.5 mr-0.5" />
            Built-in
          </Badge>
        )
      case "community":
        return (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-indigo-600 border-indigo-200 dark:text-indigo-400 dark:border-indigo-800">
            <Users className="h-2.5 w-2.5 mr-0.5" />
            Community
          </Badge>
        )
      default:
        return (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            <Wrench className="h-2.5 w-2.5 mr-0.5" />
            {CATEGORY_LABELS[category] ?? category}
          </Badge>
        )
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Agent Tools</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Enable tools this agent can use during conversations.
        </p>
      </div>

      {!modelSupportsFunctionCalling && selectedToolIds.length > 0 && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          Selected model does not support tools. Switch to a model with the
          &quot;Tools&quot; badge.
        </p>
      )}

      {/* Search + Filter + Sort + Actions */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search tools..."
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
                {toolCategories.length > 1 && (
                  <CommandGroup heading="Category">
                    {toolCategories.map((cat) => {
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
          onClick={() => setMarketplaceOpen(true)}
          className="shrink-0 h-9"
        >
          <Store className="h-3.5 w-3.5 mr-1.5" />
          Marketplace
        </Button>
      </div>

      {/* Tools list */}
      <div className="space-y-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Loading tools...</p>
        ) : filteredTools.length === 0 ? (
          hasActiveFilters ? (
            <div className="text-center py-8">
              <Search className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No tools match your filters</p>
              <button
                onClick={clearAllFilters}
                className="mt-2 text-xs font-medium text-foreground/70 hover:text-foreground transition-colors cursor-pointer"
              >
                Clear all filters
              </button>
            </div>
          ) : (
            <div className="text-center py-8">
              <Wrench className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No tools available</p>
              <p className="text-xs text-muted-foreground mt-1">
                Install tools from the Marketplace or create custom tools in Settings.
              </p>
            </div>
          )
        ) : (
          <>
            {hasActiveFilters && (
              <p className="text-xs text-muted-foreground">
                Showing{" "}
                <span className="font-semibold text-foreground">{filteredTools.length}</span>
                {" "}of {tools.length} tools
              </p>
            )}
            {filteredTools.map((tool) => {
              const isSelected = selectedToolIds.includes(tool.id)
              const toolIcon = getToolIcon(tool)

              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => onToggleTool(tool.id)}
                  className={cn(
                    "flex items-start gap-4 p-4 rounded-lg text-left transition-all w-full border",
                    isSelected
                      ? "bg-primary/5 border-primary ring-1 ring-primary/20"
                      : "border-border hover:bg-muted/50"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg shrink-0",
                      isSelected ? "bg-primary/10" : "bg-muted"
                    )}
                  >
                    <DynamicIcon
                      icon={toolIcon}
                      fallback={Wrench}
                      className={cn("h-4 w-4", isSelected ? "text-primary" : "text-muted-foreground")}
                      emojiClassName="text-lg"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{tool.displayName}</span>
                      {categoryBadge(tool.category)}
                      {tool.assistantCount > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          {tool.assistantCount} agent{tool.assistantCount !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {tool.description}
                    </p>
                    {tool.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {tool.tags.map((tag) => (
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
                    {tool.category === "custom" && !tool.executionConfig?.url && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-amber-500">
                        <AlertTriangle className="h-3 w-3" />
                        No endpoint configured
                      </div>
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
              )
            })}
          </>
        )}
      </div>

      {selectedToolIds.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {selectedToolIds.length} tool{selectedToolIds.length !== 1 ? "s" : ""} enabled
        </p>
      )}

      {/* Link to manage tools */}
      <Button variant="link" size="sm" className="px-0 text-xs" asChild>
        <Link href="/dashboard/settings/tools">
          Manage Tools
          <ExternalLink className="ml-1 h-3 w-3" />
        </Link>
      </Button>

      {/* Marketplace Picker Sheet */}
      <MarketplacePickerSheet
        open={marketplaceOpen}
        onOpenChange={setMarketplaceOpen}
        type="tool"
        boundItemIds={selectedToolIds}
        onItemInstalled={(result) => {
          fetchTools()
          if (result.installedId && !selectedToolIds.includes(result.installedId)) {
            onToggleTool(result.installedId)
          }
        }}
        onExistingItemAdded={(toolId) => {
          if (!selectedToolIds.includes(toolId)) onToggleTool(toolId)
        }}
      />
    </div>
  )
}
