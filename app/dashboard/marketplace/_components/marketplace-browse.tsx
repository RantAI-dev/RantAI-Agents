"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import {
  Search,
  Loader2,
  Store,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Package,
  Workflow,
  X,
  SlidersHorizontal,
  Check,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useMarketplace } from "@/hooks/use-marketplace"
import { MarketplaceCard } from "./marketplace-card"
import { ItemDetailDialog } from "./item-detail-dialog"
import { DashboardPageHeader } from "@/app/dashboard/_components/dashboard-page-header"

const TYPE_CONFIG: Record<
  string,
  {
    label: string
    subtitle: string
    gradient: string
    accentClass: string
    icon: React.ElementType
  }
> = {
  assistant: {
    label: "Assistants",
    subtitle: "Pre-built AI assistants ready to deploy",
    gradient:
      "from-amber-500/8 via-orange-500/5 to-transparent dark:from-amber-500/10 dark:via-orange-500/6 dark:to-transparent",
    accentClass: "text-amber-600 dark:text-amber-400",
    icon: Package,
  },
  skill: {
    label: "Skills",
    subtitle: "Enhance your agents with specialized capabilities",
    gradient:
      "from-violet-500/8 via-purple-500/5 to-transparent dark:from-violet-500/10 dark:via-purple-500/6 dark:to-transparent",
    accentClass: "text-violet-600 dark:text-violet-400",
    icon: Sparkles,
  },
  tool: {
    label: "Tools",
    subtitle: "Connect to external services and APIs",
    gradient:
      "from-sky-500/8 via-cyan-500/5 to-transparent dark:from-sky-500/10 dark:via-cyan-500/6 dark:to-transparent",
    accentClass: "text-sky-600 dark:text-sky-400",
    icon: TrendingUp,
  },
  mcp: {
    label: "MCP Servers",
    subtitle: "Model Context Protocol integrations",
    gradient:
      "from-emerald-500/8 via-teal-500/5 to-transparent dark:from-emerald-500/10 dark:via-teal-500/6 dark:to-transparent",
    accentClass: "text-emerald-600 dark:text-emerald-400",
    icon: TrendingUp,
  },
  workflow: {
    label: "Workflows",
    subtitle: "Ready-made workflow templates you can import and run",
    gradient:
      "from-indigo-500/8 via-blue-500/5 to-transparent dark:from-indigo-500/10 dark:via-blue-500/6 dark:to-transparent",
    accentClass: "text-indigo-600 dark:text-indigo-400",
    icon: Workflow,
  },
}

/** Hex colors for category filter chips — matches CATEGORY_ACCENTS in marketplace-card */
const CATEGORY_COLORS: Record<string, string> = {
  Productivity: "#f59e0b",
  Development: "#0ea5e9",
  Communication: "#8b5cf6",
  Data: "#10b981",
  "AI & Writing": "#f43f5e",
  "Customer Support": "#f97316",
  Utilities: "#64748b",
  Insurance: "#3b82f6",
  Finance: "#10b981",
  Healthcare: "#f43f5e",
  Legal: "#64748b",
  "E-commerce": "#a855f7",
  Marketing: "#ec4899",
  Sales: "#f97316",
  HR: "#06b6d4",
  Education: "#84cc16",
  "IT Support": "#6b7280",
  Compliance: "#ef4444",
  Travel: "#0ea5e9",
  Knowledge: "#8b5cf6",
  IT: "#6b7280",
  Content: "#d946ef",
}
const DEFAULT_CATEGORY_COLOR = "#6b7280"

type SortOption = "featured" | "az" | "installed"

interface MarketplaceBrowseProps {
  type: string
}

export function MarketplaceBrowse({ type }: MarketplaceBrowseProps) {
  const router = useRouter()
  const {
    items,
    categories,
    isLoading,
    selectedItem,
    detailLoading,
    fetchItems,
    fetchItemDetail,
    clearSelectedItem,
    installItem,
    uninstallItem,
  } = useMarketplace()
  const [search, setSearch] = useState("")
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set())
  const [sortOption, setSortOption] = useState<SortOption>("featured")

  const config = TYPE_CONFIG[type] || TYPE_CONFIG.assistant

  // Fetch all items for this type once — filtering/sorting is client-side
  const doFetch = useCallback(() => {
    fetchItems({ type })
  }, [fetchItems, type])

  useEffect(() => {
    doFetch()
  }, [doFetch])

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  const clearFilters = () => {
    setSearch("")
    setSelectedCategories(new Set())
    setSortOption("featured")
  }

  const hasActiveFilters =
    search.trim().length > 0 || selectedCategories.size > 0

  // Client-side filter + sort
  const displayedItems = useMemo(() => {
    let result = [...items]

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (i) =>
          i.displayName.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q) ||
          i.tags?.some((t) => t.toLowerCase().includes(q))
      )
    }

    // Category filter
    if (selectedCategories.size > 0) {
      result = result.filter((i) => selectedCategories.has(i.category))
    }

    // Sort
    if (sortOption === "az") {
      result.sort((a, b) => a.displayName.localeCompare(b.displayName))
    } else if (sortOption === "installed") {
      result.sort((a, b) => {
        if (a.installed && !b.installed) return -1
        if (!a.installed && b.installed) return 1
        return 0
      })
    }
    // "featured" keeps the API order (built-ins first, then featured desc)

    return result
  }, [items, search, selectedCategories, sortOption])

  const installedCount = useMemo(
    () => (type === "workflow" || type === "assistant" ? 0 : items.filter((i) => i.installed).length),
    [items, type]
  )

  const handleUseTemplate = useCallback(
    async (id: string) => {
      const result = await installItem(id)
      if (result?.installedId) {
        // Route to the appropriate editor based on item type
        const item = items.find((i) => i.id === id)
        if (item?.type === "assistant") {
          router.push(`/dashboard/agent-builder/${result.installedId}`)
        } else {
          router.push(`/dashboard/workflows/${result.installedId}`)
        }
      }
    },
    [installItem, router, items]
  )

  return (
    <div className="flex flex-col h-full">
      <DashboardPageHeader title="Marketplace" subtitle={config.subtitle} />

      <div className="flex-1 overflow-auto">
        {/* Hero gradient band */}
        <div className={`relative bg-gradient-to-b ${config.gradient}`}>
          <div className="absolute inset-0 dot-grid-bg opacity-30 dark:opacity-15" />

          <div className="relative px-6 pt-6 pb-5">
            {/* Stats row */}
            <div className="flex items-center gap-5 mb-5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Package className="h-3.5 w-3.5" />
                <span>
                  <span className="font-semibold text-foreground">
                    {items.length}
                  </span>{" "}
                  available
                </span>
              </div>
              {installedCount > 0 && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>
                    <span className="font-semibold text-foreground">
                      {installedCount}
                    </span>{" "}
                    installed
                  </span>
                </div>
              )}
            </div>

            {/* Search + Filter + Sort row */}
            <div className="flex items-center gap-2">
              {/* Search input */}
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40 pointer-events-none" />
                <Input
                  placeholder={`Search ${config.label.toLowerCase()}...`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9 bg-background/80 backdrop-blur-sm border-border/60 shadow-sm focus-visible:shadow-md transition-shadow duration-200"
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

              {/* Filters popover */}
              {categories.length > 0 && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 gap-1.5 bg-background/80 backdrop-blur-sm border-border/60 shrink-0"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      Filter
                      {selectedCategories.size > 0 && (
                        <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-[10px] font-medium text-background">
                          {selectedCategories.size}
                        </span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-[220px] p-0">
                    <Command>
                      <CommandInput placeholder="Search categories..." />
                      <CommandList className="max-h-[240px] overflow-y-auto">
                        <CommandEmpty>No category found.</CommandEmpty>
                        <CommandGroup heading="Categories">
                          {categories.map((cat) => {
                            const active = selectedCategories.has(cat)
                            const color = CATEGORY_COLORS[cat] || DEFAULT_CATEGORY_COLOR
                            return (
                              <CommandItem
                                key={cat}
                                value={cat}
                                onSelect={() => toggleCategory(cat)}
                                className="cursor-pointer"
                              >
                                <div
                                  className="h-4 w-4 rounded border shrink-0 mr-2 flex items-center justify-center"
                                  style={{
                                    borderColor: color,
                                    backgroundColor: active ? `${color}30` : "transparent",
                                  }}
                                >
                                  {active && (
                                    <Check className="h-3 w-3" style={{ color }} />
                                  )}
                                </div>
                                <span className="truncate">{cat}</span>
                              </CommandItem>
                            )
                          })}
                        </CommandGroup>
                        {selectedCategories.size > 0 && (
                          <>
                            <CommandSeparator />
                            <CommandGroup>
                              <CommandItem
                                onSelect={() => setSelectedCategories(new Set())}
                                className="cursor-pointer"
                              >
                                <X className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                                <span className="text-muted-foreground">Clear filter</span>
                              </CommandItem>
                            </CommandGroup>
                          </>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}

              {/* Sort dropdown */}
              <Select
                value={sortOption}
                onValueChange={(v) => setSortOption(v as SortOption)}
              >
                <SelectTrigger className="h-9 w-[130px] bg-background/80 backdrop-blur-sm border-border/60 text-sm shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="featured">Featured</SelectItem>
                  <SelectItem value="az">A – Z</SelectItem>
                  {type !== "workflow" && type !== "assistant" && (
                    <SelectItem value="installed">Installed first</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Content area */}
        <div className="px-6 py-5">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-foreground/5 animate-ping" />
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground relative" />
              </div>
              <p className="text-xs text-muted-foreground">
                Loading marketplace...
              </p>
            </div>
          ) : displayedItems.length === 0 ? (
            <div className="text-center py-20">
              <div className="relative inline-flex">
                <div className="absolute inset-0 rounded-2xl bg-muted/50 blur-xl scale-150" />
                <div className="relative h-16 w-16 rounded-2xl bg-muted/80 border border-border/40 flex items-center justify-center mx-auto">
                  <Store className="h-7 w-7 text-muted-foreground/50" />
                </div>
              </div>
              <p className="text-sm font-medium text-muted-foreground mt-5">
                No {config.label.toLowerCase()} found
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1.5 max-w-[260px] mx-auto">
                {hasActiveFilters
                  ? "Try a different search term or clear filters"
                  : `Check back later for new ${config.label.toLowerCase()} in the marketplace.`}
              </p>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-foreground/70 hover:text-foreground transition-colors cursor-pointer"
                >
                  Clear all filters
                  <ArrowRight className="h-3 w-3" />
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Results count */}
              {hasActiveFilters && (
                <p className="text-xs text-muted-foreground mb-4">
                  Showing{" "}
                  <span className="font-semibold text-foreground">
                    {displayedItems.length}
                  </span>{" "}
                  of {items.length}{" "}
                  {items.length === 1 ? "result" : "results"}
                  {selectedCategories.size > 0 && (
                    <>
                      {" "}in{" "}
                      <span className="font-medium text-foreground">
                        {[...selectedCategories].join(", ")}
                      </span>
                    </>
                  )}
                </p>
              )}

              {/* Items grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {displayedItems.map((item, index) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: index * 0.04 }}
                  >
                    <MarketplaceCard
                      item={item}
                      onInstall={installItem}
                      onUninstall={uninstallItem}
                      onViewDetail={fetchItemDetail}
                      onUseTemplate={handleUseTemplate}
                    />
                  </motion.div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <ItemDetailDialog
        item={selectedItem}
        loading={detailLoading}
        open={!!selectedItem || detailLoading}
        onOpenChange={(open) => {
          if (!open) clearSelectedItem()
        }}
        onInstall={installItem}
        onUninstall={uninstallItem}
        onUseTemplate={handleUseTemplate}
      />
    </div>
  )
}
