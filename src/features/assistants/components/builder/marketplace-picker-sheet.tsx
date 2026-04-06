"use client"

import { useState, useEffect, useMemo } from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DynamicIcon } from "@/components/ui/dynamic-icon"
import { cn } from "@/lib/utils"
import {
  Search,
  Check,
  Loader2,
  Wrench,
  Sparkles,
  Package,
  Users,
  Download,
  Plus,
} from "@/lib/icons"
import { useMarketplace, type MarketplaceItem } from "@/hooks/use-marketplace"
import { ConfigFormDialog } from "@/features/marketplace/components/config-form-dialog"
import { toast } from "sonner"

interface MarketplacePickerSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  type: "tool" | "skill"
  boundItemIds: string[]
  onItemInstalled: (result: {
    installedId: string
    skillId?: string
    toolIds?: string[]
  }) => void
  onExistingItemAdded: (installedId: string) => void
}

const TYPE_CONFIG = {
  tool: {
    title: "Add Tools from Marketplace",
    description: "Install tools and add them to this agent.",
    icon: Wrench,
    emptyText: "No tools available in the marketplace.",
  },
  skill: {
    title: "Add Skills from Marketplace",
    description: "Install skills and add them to this agent.",
    icon: Sparkles,
    emptyText: "No skills available in the marketplace.",
  },
}

export function MarketplacePickerSheet({
  open,
  onOpenChange,
  type,
  boundItemIds,
  onItemInstalled,
  onExistingItemAdded,
}: MarketplacePickerSheetProps) {
  const { items, categories, isLoading, fetchItems, installItem } =
    useMarketplace()
  const [search, setSearch] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [configItem, setConfigItem] = useState<MarketplaceItem | null>(null)

  const config = TYPE_CONFIG[type]

  useEffect(() => {
    if (open) {
      fetchItems({ type })
      setSearch("")
      setSelectedCategory(null)
    }
  }, [open, type, fetchItems])

  const filtered = useMemo(() => {
    let result = items
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (i) =>
          i.displayName.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q) ||
          i.tags.some((t) => t.toLowerCase().includes(q))
      )
    }
    if (selectedCategory) {
      result = result.filter((i) => i.category === selectedCategory)
    }
    return result
  }, [items, search, selectedCategory])

  const handleInstall = async (
    item: MarketplaceItem,
    itemConfig?: Record<string, unknown>
  ) => {
    setInstallingId(item.id)
    try {
      const result = await installItem(item.id, itemConfig)
      if (result.installedId) {
        onItemInstalled({
          installedId: result.installedId,
          skillId: result.skillId,
          toolIds: result.toolIds,
        })
        toast.success(`${item.displayName} installed and added to agent`)
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to install"
      )
    } finally {
      setInstallingId(null)
    }
  }

  const handleAddExisting = (item: MarketplaceItem) => {
    const bindableId = getBindableId(item)
    if (bindableId) {
      onExistingItemAdded(bindableId)
      toast.success(`${item.displayName} added to agent`)
    }
  }

  // For skills, the binding ID is skillId (Skill.id), not installedId (InstalledSkill.id)
  const getBindableId = (item: MarketplaceItem): string | undefined => {
    if (type === "skill") return item.skillId || item.installedId
    return item.installedId
  }

  const getItemState = (
    item: MarketplaceItem
  ): "bound" | "installed" | "available" | "builtin" => {
    if (item.isBuiltIn) return "builtin"
    const bindableId = getBindableId(item)
    if (item.installed && bindableId && boundItemIds.includes(bindableId))
      return "bound"
    if (item.installed) return "installed"
    return "available"
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
          <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <SheetTitle className="flex items-center gap-2">
              <config.icon className="h-5 w-5" />
              {config.title}
            </SheetTitle>
            <SheetDescription>{config.description}</SheetDescription>

            {/* Search */}
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder={`Search ${type}s...`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>

            {/* Category pills */}
            {categories.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                    !selectedCategory
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  All
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() =>
                      setSelectedCategory(
                        selectedCategory === cat ? null : cat
                      )
                    }
                    className={cn(
                      "px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                      selectedCategory === cat
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </SheetHeader>

          {/* Items list */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <config.icon className="h-8 w-8 mx-auto text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  {search.trim()
                    ? `No ${type}s match "${search}"`
                    : config.emptyText}
                </p>
              </div>
            ) : (
              filtered.map((item) => {
                const state = getItemState(item)
                const isInstalling = installingId === item.id
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-lg border transition-colors",
                      state === "bound"
                        ? "bg-primary/5 border-primary/30"
                        : "border-border hover:bg-muted/50"
                    )}
                  >
                    {/* Icon */}
                    <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                      <DynamicIcon
                        icon={item.icon}
                        fallback={type === "tool" ? Wrench : Sparkles}
                        className="h-4 w-4 text-muted-foreground"
                        emojiClassName="text-base"
                      />
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {item.displayName}
                        </span>
                        {item.isBuiltIn && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1 py-0 shrink-0"
                          >
                            Built-in
                          </Badge>
                        )}
                        {(item.communitySkillName || item.communityToolName) && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1 py-0 shrink-0"
                          >
                            <Users className="h-2.5 w-2.5 mr-0.5" />
                            Community
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {item.description}
                      </p>
                      {item.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {item.tags.slice(0, 3).map((tag) => (
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
                    </div>

                    {/* Action */}
                    <div className="shrink-0 pt-0.5">
                      {state === "builtin" ? (
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-2 py-0.5"
                        >
                          <Package className="h-2.5 w-2.5 mr-1" />
                          Always On
                        </Badge>
                      ) : state === "bound" ? (
                        <Badge className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary border-primary/20">
                          <Check className="h-2.5 w-2.5 mr-1" />
                          Added
                        </Badge>
                      ) : state === "installed" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleAddExisting(item)}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add
                        </Button>
                      ) : (
                        <Button
                          variant="default"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={isInstalling}
                          onClick={() => {
                            if (item.configSchema) {
                              setConfigItem(item)
                            } else {
                              handleInstall(item)
                            }
                          }}
                        >
                          {isInstalling ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          ) : (
                            <Download className="h-3 w-3 mr-1" />
                          )}
                          Install
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Footer stats */}
          <div className="border-t px-6 py-3 shrink-0">
            <p className="text-xs text-muted-foreground">
              {filtered.length} {type}{filtered.length !== 1 ? "s" : ""} available
              {" · "}
              {filtered.filter((i) => getItemState(i) === "bound").length} added to agent
            </p>
          </div>
        </SheetContent>
      </Sheet>

      {/* Config dialog for items that need configuration before install */}
      {configItem && (
        <ConfigFormDialog
          open={!!configItem}
          onOpenChange={(open) => !open && setConfigItem(null)}
          item={configItem}
          onSubmit={async (config) => {
            await handleInstall(configItem, config)
            setConfigItem(null)
          }}
        />
      )}
    </>
  )
}
