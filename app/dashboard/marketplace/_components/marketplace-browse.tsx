"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Search,
  Loader2,
  Store,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Package,
  X,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useMarketplace } from "@/hooks/use-marketplace"
import { MarketplaceCard } from "./marketplace-card"
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
}

const CATEGORY_COLORS: Record<string, string> = {
  Productivity:
    "bg-amber-50 text-amber-700 border-amber-200/60 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/40 dark:hover:bg-amber-950/60",
  Development:
    "bg-sky-50 text-sky-700 border-sky-200/60 hover:bg-sky-100 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/40 dark:hover:bg-sky-950/60",
  Communication:
    "bg-violet-50 text-violet-700 border-violet-200/60 hover:bg-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800/40 dark:hover:bg-violet-950/60",
  Data: "bg-emerald-50 text-emerald-700 border-emerald-200/60 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40 dark:hover:bg-emerald-950/60",
  "AI & Writing":
    "bg-rose-50 text-rose-700 border-rose-200/60 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/40 dark:hover:bg-rose-950/60",
  "Customer Support":
    "bg-orange-50 text-orange-700 border-orange-200/60 hover:bg-orange-100 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800/40 dark:hover:bg-orange-950/60",
  Utilities:
    "bg-slate-50 text-slate-700 border-slate-200/60 hover:bg-slate-100 dark:bg-slate-800/40 dark:text-slate-300 dark:border-slate-600/40 dark:hover:bg-slate-800/60",
}

const DEFAULT_CATEGORY_COLOR =
  "bg-muted text-muted-foreground border-border hover:bg-muted/80"

interface MarketplaceBrowseProps {
  type: string
}

export function MarketplaceBrowse({ type }: MarketplaceBrowseProps) {
  const {
    items,
    categories,
    isLoading,
    fetchItems,
    installItem,
    uninstallItem,
  } = useMarketplace()
  const [search, setSearch] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [searchFocused, setSearchFocused] = useState(false)

  const config = TYPE_CONFIG[type] || TYPE_CONFIG.assistant

  const doFetch = useCallback(
    (opts?: { search?: string; category?: string }) => {
      fetchItems({
        type,
        search: opts?.search || undefined,
        category: opts?.category || undefined,
      })
    },
    [fetchItems, type]
  )

  useEffect(() => {
    doFetch()
  }, [doFetch])

  const handleSearch = (value: string) => {
    setSearch(value)
    doFetch({ search: value, category: selectedCategory || undefined })
  }

  const handleCategoryFilter = (cat: string | null) => {
    setSelectedCategory(cat)
    doFetch({ search, category: cat || undefined })
  }

  const installedCount = useMemo(
    () => items.filter((i) => i.installed).length,
    [items]
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

            {/* Search bar */}
            <div className="relative max-w-lg">
              <Search
                className={`absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors duration-200 ${
                  searchFocused
                    ? "text-foreground"
                    : "text-muted-foreground/60"
                }`}
              />
              <Input
                placeholder={`Search ${config.label.toLowerCase()}...`}
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                className="pl-10 h-10 bg-background/80 backdrop-blur-sm border-border/60 shadow-sm focus-visible:shadow-md transition-shadow duration-200"
              />
              {search && (
                <button
                  onClick={() => handleSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Category pills */}
            {categories.length > 0 && (
              <div className="flex items-center gap-2 mt-4 flex-wrap">
                <button
                  onClick={() => handleCategoryFilter(null)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-200 ${
                    selectedCategory === null
                      ? "bg-foreground text-background border-foreground shadow-sm"
                      : "bg-background/60 text-muted-foreground border-border/60 hover:bg-background hover:text-foreground hover:border-border"
                  }`}
                >
                  All
                  <Badge
                    variant="secondary"
                    className={`h-4 min-w-4 px-1 text-[10px] leading-none font-semibold rounded-full ${
                      selectedCategory === null
                        ? "bg-background/20 text-background"
                        : ""
                    }`}
                  >
                    {items.length}
                  </Badge>
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() =>
                      handleCategoryFilter(
                        selectedCategory === cat ? null : cat
                      )
                    }
                    className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-200 ${
                      selectedCategory === cat
                        ? "bg-foreground text-background border-foreground shadow-sm"
                        : CATEGORY_COLORS[cat] || DEFAULT_CATEGORY_COLOR
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
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
          ) : items.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="text-center py-20"
            >
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
                {search
                  ? `Try a different search term or clear filters`
                  : `Check back later for new ${config.label.toLowerCase()} in the marketplace.`}
              </p>
              {search && (
                <button
                  onClick={() => {
                    handleSearch("")
                    handleCategoryFilter(null)
                  }}
                  className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-foreground/70 hover:text-foreground transition-colors"
                >
                  Clear all filters
                  <ArrowRight className="h-3 w-3" />
                </button>
              )}
            </motion.div>
          ) : (
            <>
              {/* Results count */}
              {(search || selectedCategory) && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-xs text-muted-foreground mb-4"
                >
                  Showing {items.length}{" "}
                  {items.length === 1 ? "result" : "results"}
                  {selectedCategory && (
                    <>
                      {" "}
                      in{" "}
                      <span className="font-medium text-foreground">
                        {selectedCategory}
                      </span>
                    </>
                  )}
                  {search && (
                    <>
                      {" "}
                      for &ldquo;
                      <span className="font-medium text-foreground">
                        {search}
                      </span>
                      &rdquo;
                    </>
                  )}
                </motion.p>
              )}

              {/* Items grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                <AnimatePresence mode="popLayout">
                  {items.map((item, index) => (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, y: 16, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{
                        duration: 0.35,
                        delay: index * 0.04,
                        ease: [0.25, 0.46, 0.45, 0.94],
                      }}
                    >
                      <MarketplaceCard
                        item={item}
                        onInstall={installItem}
                        onUninstall={uninstallItem}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
