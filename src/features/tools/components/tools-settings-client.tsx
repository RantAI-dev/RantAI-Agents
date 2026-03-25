"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import {
  Wrench,
  Plus,
  Loader2,
  Trash2,
  Pencil,
  Package,
  Search,
  HelpCircle,
  ChevronDown,
  AlertTriangle,
  Users,
  Store,
  SlidersHorizontal,
  Check,
  X,
} from "@/lib/icons"
import { DynamicIcon } from "@/components/ui/dynamic-icon"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { useTools, type ToolItem } from "@/hooks/use-tools"
import { ToolDialog } from "@/src/features/tools/components/tool-dialog"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

// Emoji icons for built-in tools
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

export default function ToolsSettingsClient({
  initialTools,
}: {
  initialTools: ToolItem[]
}) {
  const { tools, isLoading, updateTool, deleteTool } = useTools({ initialTools })
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTool, setEditingTool] = useState<string | null>(null)
  const [deletingTool, setDeletingTool] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set())
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())
  const [sortOption, setSortOption] = useState<"az" | "recent" | "enabled">("recent")
  const [helpOpen, setHelpOpen] = useState(false)

  // Exclude MCP tools — they have their own settings page
  const nonMcpTools = useMemo(() => tools.filter((t) => t.category !== "mcp"), [tools])

  const TOOL_CATEGORY_LABELS: Record<string, string> = {
    builtin: "Built-in",
    custom: "Custom",
    community: "Community",
    openapi: "OpenAPI",
  }

  // Distinct categories and tags from installed tools
  const toolCategories = useMemo(() => {
    const cats = new Set(nonMcpTools.map((t) => t.category))
    return [...cats].sort()
  }, [nonMcpTools])

  const allTags = useMemo(() => {
    const tags = new Set<string>()
    nonMcpTools.forEach((t) => t.tags.forEach((tag) => tags.add(tag)))
    return [...tags].sort()
  }, [nonMcpTools])

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
  const hasActiveFilters = searchQuery.trim().length > 0 || activeFilterCount > 0

  const clearAllFilters = () => {
    setSearchQuery("")
    setSelectedCategories(new Set())
    setSelectedTags(new Set())
  }

  const filteredTools = useMemo(() => {
    let result = [...nonMcpTools]

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
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
    } else if (sortOption === "enabled") {
      result.sort((a, b) => {
        if (a.enabled && !b.enabled) return -1
        if (!a.enabled && b.enabled) return 1
        return 0
      })
    }
    // "recent" keeps API order

    return result
  }, [nonMcpTools, searchQuery, selectedCategories, selectedTags, sortOption])

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await updateTool(id, { enabled })
      toast.success(enabled ? "Tool enabled" : "Tool disabled")
    } catch {
      toast.error("Failed to update tool")
    }
  }

  const handleDelete = async () => {
    if (!deletingTool) return
    try {
      await deleteTool(deletingTool)
      toast.success("Tool deleted")
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete tool"
      )
    } finally {
      setDeletingTool(null)
    }
  }

  const categoryBadge = (category: string) => {
    switch (category) {
      case "builtin":
        return (
          <Badge variant="secondary">
            <Package className="h-3 w-3 mr-1" />
            Built-in
          </Badge>
        )
      case "community":
        return (
          <Badge variant="outline" className="text-indigo-600 border-indigo-200 dark:text-indigo-400 dark:border-indigo-800">
            <Users className="h-3 w-3 mr-1" />
            Community
          </Badge>
        )
      default:
        return (
          <Badge variant="outline">
            <Wrench className="h-3 w-3 mr-1" />
            Custom
          </Badge>
        )
    }
  }

  const renderToolCard = (tool: ToolItem) => {
    // Use icon from DB first (marketplace/community), then fallback to hardcoded builtin map
    const emojiIcon =
      tool.icon || (tool.category === "builtin" ? BUILTIN_TOOL_ICONS[tool.name] : undefined)

    return (
      <Card key={tool.id} className={cn(!tool.enabled && "opacity-60")}>
        <CardContent className="p-4 flex items-start gap-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted shrink-0">
            <DynamicIcon
              icon={emojiIcon}
              fallback={Wrench}
              className="h-4 w-4 text-muted-foreground"
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
                    variant={selectedTags.has(tag) ? "default" : "outline"}
                    className="text-[10px] px-1.5 py-0 cursor-pointer hover:bg-muted"
                    onClick={() => toggleTag(tag)}
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
          <div className="flex items-center gap-1.5 shrink-0">
            <Switch
              checked={tool.enabled}
              onCheckedChange={(checked) =>
                handleToggle(tool.id, checked)
              }
            />
            {!tool.isBuiltIn && tool.category !== "community" && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setEditingTool(tool.id)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => setDeletingTool(tool.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  const renderEmptyState = () => {
    if (hasActiveFilters) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Search className="h-10 w-10 text-muted-foreground mb-3" />
          <h3 className="text-sm font-medium mb-1">No tools found</h3>
          <p className="text-sm text-muted-foreground">
            Try a different search term or clear filters.
          </p>
          <button
            onClick={clearAllFilters}
            className="mt-3 text-xs font-medium text-foreground/70 hover:text-foreground transition-colors cursor-pointer"
          >
            Clear all filters
          </button>
        </div>
      )
    }

    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Wrench className="h-10 w-10 text-muted-foreground mb-3" />
          <h3 className="text-sm font-medium mb-1">No tools yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Create a custom tool or install from the Marketplace.
          </p>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Create Custom Tool
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Tools</h2>
          <p className="text-sm text-muted-foreground">
            Manage agent tools that assistants can use during conversations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/dashboard/marketplace/tools">
              <Store className="h-4 w-4 mr-1" />
              Browse Marketplace
            </Link>
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Create Tool
          </Button>
        </div>
      </div>

      {/* In-app documentation */}
      <Collapsible open={helpOpen} onOpenChange={setHelpOpen}>
        <div className="rounded-lg border border-muted bg-card px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">How Custom Tools Work</p>
                <p className="text-xs text-muted-foreground">
                  Create tools that your AI assistants can call during conversations.
                </p>
              </div>
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                {helpOpen ? "Hide" : "Learn more"}
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform",
                    helpOpen && "rotate-180"
                  )}
                />
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent>
            <div className="mt-4 space-y-4 text-sm border-t border-muted pt-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <h4 className="font-medium flex items-center gap-1.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">1</span>
                    Create a Tool
                  </h4>
                  <p className="text-muted-foreground text-xs leading-relaxed pl-6.5">
                    Give it a name, display name, and description. The AI reads the description to decide when to use your tool, so be specific about what it does.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <h4 className="font-medium flex items-center gap-1.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">2</span>
                    Define Parameters
                  </h4>
                  <p className="text-muted-foreground text-xs leading-relaxed pl-6.5">
                    Use the visual editor or paste JSON Schema. Parameters tell the AI what inputs your tool accepts (e.g. a city name, an ID, a search query).
                  </p>
                </div>
                <div className="space-y-1.5">
                  <h4 className="font-medium flex items-center gap-1.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">3</span>
                    Configure Execution
                  </h4>
                  <p className="text-muted-foreground text-xs leading-relaxed pl-6.5">
                    Set the HTTP endpoint URL that will be called when the AI invokes your tool. The parameters are sent as JSON in the request body.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <h4 className="font-medium flex items-center gap-1.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">4</span>
                    Assign to an Assistant
                  </h4>
                  <p className="text-muted-foreground text-xs leading-relaxed pl-6.5">
                    Go to the assistant&apos;s settings and enable your tool in the Tools tab. The assistant will then be able to call it during chats.
                  </p>
                </div>
              </div>

              <div className="rounded-md bg-muted/50 p-3 space-y-2">
                <h4 className="font-medium text-xs">Example: Weather API Tool</h4>
                <pre className="text-[11px] text-muted-foreground overflow-x-auto whitespace-pre">{`POST https://your-api.com/weather
Content-Type: application/json

Request:  { "city": "Jakarta" }
Response: { "temperature": 32, "condition": "Sunny" }`}</pre>
              </div>

              <div className="space-y-1.5">
                <h4 className="font-medium text-xs">Authentication</h4>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  You can configure <strong>Bearer Token</strong> (sends <code className="text-[11px] bg-muted px-1 rounded">Authorization: Bearer &lt;token&gt;</code>) or <strong>API Key</strong> (sends the key in a custom header like <code className="text-[11px] bg-muted px-1 rounded">X-API-Key</code>) in the Execution Config section of the tool dialog.
                </p>
              </div>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* Search + Filter + Sort */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search tools..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Filter popover (categories + tags) */}
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
                      const label = TOOL_CATEGORY_LABELS[cat] ?? cat
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
            <SelectItem value="enabled">Enabled first</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tools list */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredTools.length === 0 ? (
          renderEmptyState()
        ) : (
          <>
            {hasActiveFilters && (
              <p className="text-xs text-muted-foreground">
                Showing{" "}
                <span className="font-semibold text-foreground">{filteredTools.length}</span>
                {" "}of {nonMcpTools.length} tools
              </p>
            )}
            {filteredTools.map(renderToolCard)}
          </>
        )}
      </div>

      <ToolDialog
        open={dialogOpen || !!editingTool}
        onOpenChange={(open) => {
          if (!open) {
            setDialogOpen(false)
            setEditingTool(null)
          }
        }}
        editToolId={editingTool}
      />

      <AlertDialog
        open={!!deletingTool}
        onOpenChange={(open) => !open && setDeletingTool(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tool</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the tool and disconnect it from all assistants.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
