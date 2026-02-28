"use client"

import { useState, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Plus, Search, Bot, SlidersHorizontal, X, Check, Tag } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { useAssistants } from "@/hooks/use-assistants"
import { useDefaultAssistant } from "@/hooks/use-default-assistant"
import { DashboardPageHeader } from "../_components/dashboard-page-header"
import { AgentCard } from "./_components/agent-card"
import { AgentTemplateGallery } from "./_components/agent-template-gallery"
import { getTagColor, setTagColor, TAG_COLORS } from "@/lib/utils"
import type { Assistant } from "@/lib/types/assistant"

type SortOption = "newest" | "oldest" | "name"

export default function AgentBuilderPage() {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())
  const [customTags, setCustomTags] = useState<Set<string>>(new Set())
  const [newFilterTag, setNewFilterTag] = useState("")
  const [selectedColor, setSelectedColor] = useState<string | null>(null)
  const [sortOption, setSortOption] = useState<SortOption>("newest")
  const [deleteTarget, setDeleteTarget] = useState<Assistant | null>(null)

  const {
    assistants,
    isLoading,
    addAssistant,
    deleteAssistant,
    refetch,
  } = useAssistants()

  const {
    assistant: defaultAssistant,
    source: defaultSource,
    setUserDefault,
    clearUserDefault,
    refetch: refetchDefault,
  } = useDefaultAssistant()

  // Derive all unique tags from assistants + custom-added tags
  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    for (const a of assistants) {
      for (const t of a.tags ?? []) tagSet.add(t)
    }
    for (const t of customTags) tagSet.add(t)
    return [...tagSet].sort()
  }, [assistants, customTags])

  const addFilterTag = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return
    if (selectedColor) setTagColor(trimmed, selectedColor)
    setCustomTags((prev) => new Set(prev).add(trimmed))
    setSelectedTags((prev) => new Set(prev).add(trimmed))
    setNewFilterTag("")
    setSelectedColor(null)
  }

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  const hasActiveFilters = search.trim().length > 0 || selectedTags.size > 0
  const clearFilters = () => {
    setSearch("")
    setSelectedTags(new Set())
    setSortOption("newest")
  }

  // Filter and sort
  const displayedAgents = useMemo(() => {
    let result = [...assistants]

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          (a.tags ?? []).some((t) => t.toLowerCase().includes(q))
      )
    }

    // Tag filter
    if (selectedTags.size > 0) {
      result = result.filter((a) =>
        (a.tags ?? []).some((t) => selectedTags.has(t))
      )
    }

    // Sort
    result.sort((a, b) => {
      if (sortOption === "newest") return b.createdAt.getTime() - a.createdAt.getTime()
      if (sortOption === "oldest") return a.createdAt.getTime() - b.createdAt.getTime()
      return a.name.localeCompare(b.name)
    })

    return result
  }, [assistants, search, selectedTags, sortOption])

  const handleCreate = () => {
    router.push("/dashboard/agent-builder/new")
  }

  const handleClick = (agent: Assistant) => {
    router.push(`/dashboard/agent-builder/${agent.id}`)
  }

  const handleDuplicate = useCallback(
    async (agent: Assistant) => {
      const newAgent = await addAssistant({
        name: `${agent.name} (Copy)`,
        description: agent.description,
        emoji: agent.emoji,
        systemPrompt: agent.systemPrompt,
        model: agent.model,
        useKnowledgeBase: agent.useKnowledgeBase,
        knowledgeBaseGroupIds: agent.knowledgeBaseGroupIds,
        memoryConfig: agent.memoryConfig,
      })
      if (newAgent) {
        refetch()
        router.push(`/dashboard/agent-builder/${newAgent.id}`)
      }
    },
    [addAssistant, refetch, router]
  )

  const handleSetDefault = useCallback(
    async (agent: Assistant) => {
      const isCurrentDefault =
        defaultSource === "user" && defaultAssistant?.id === agent.id
      if (isCurrentDefault) {
        await clearUserDefault()
      } else {
        await setUserDefault(agent.id)
      }
      refetchDefault()
    },
    [defaultAssistant, defaultSource, setUserDefault, clearUserDefault, refetchDefault]
  )

  const handleDelete = async () => {
    if (deleteTarget) {
      await deleteAssistant(deleteTarget.id)
      setDeleteTarget(null)
      refetch()
      refetchDefault()
    }
  }

  const isDefault = (agent: Assistant) => defaultAssistant?.id === agent.id

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <DashboardPageHeader title="Agent Builder" />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <DashboardPageHeader
        title="Agent Builder"
        actions={
          <Button onClick={handleCreate} size="sm">
            <Plus className="h-4 w-4 mr-1.5" />
            Create Agent
          </Button>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        {/* Template Gallery */}
        <AgentTemplateGallery addAssistant={addAssistant} refetch={refetch} />

        {/* Search + Filter + Sort Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center mb-6">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search agents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-muted/30 border-muted-foreground/20 focus:bg-background transition-colors w-full"
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Filter popover */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" aria-label="Filter by tags">
                  <SlidersHorizontal className="h-4 w-4 mr-2" />
                  Filter
                  {selectedTags.size > 0 && (
                    <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-[10px] font-medium text-background">
                      {selectedTags.size}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[220px] p-0">
                <Command>
                  <CommandInput placeholder="Search tags..." />
                  <CommandList className="max-h-[240px] overflow-y-auto">
                    <CommandEmpty>No tags found.</CommandEmpty>
                    {allTags.length > 0 ? (
                      <CommandGroup heading="Tags">
                        {allTags.map((tag) => {
                          const active = selectedTags.has(tag)
                          const color = getTagColor(tag)
                          return (
                            <CommandItem
                              key={tag}
                              value={tag}
                              onSelect={() => toggleTag(tag)}
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
                              <span className="truncate">{tag}</span>
                            </CommandItem>
                          )
                        })}
                      </CommandGroup>
                    ) : (
                      <CommandGroup>
                        <div className="px-2 py-3 text-center">
                          <p className="text-xs text-muted-foreground">No tags yet</p>
                        </div>
                      </CommandGroup>
                    )}
                    {selectedTags.size > 0 && (
                      <>
                        <CommandSeparator />
                        <CommandGroup>
                          <CommandItem
                            onSelect={() => setSelectedTags(new Set())}
                            className="cursor-pointer"
                          >
                            <X className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                            <span className="text-muted-foreground">Clear filter</span>
                          </CommandItem>
                        </CommandGroup>
                      </>
                    )}
                  </CommandList>
                  <div className="border-t px-2 py-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <input
                        value={newFilterTag}
                        onChange={(e) => setNewFilterTag(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            addFilterTag(newFilterTag)
                          }
                          e.stopPropagation()
                        }}
                        placeholder="Add new tag..."
                        className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                      />
                      {newFilterTag.trim() && (
                        <button
                          onClick={() => addFilterTag(newFilterTag)}
                          className="text-xs text-primary hover:text-primary/80 font-medium shrink-0"
                        >
                          Add
                        </button>
                      )}
                    </div>
                    {newFilterTag.trim() && (
                      <div className="flex flex-wrap gap-1.5 px-5">
                        {TAG_COLORS.map((c) => (
                          <button
                            key={c}
                            onClick={() => setSelectedColor(selectedColor === c ? null : c)}
                            className="h-4 w-4 rounded-full border-2 transition-transform hover:scale-110"
                            style={{
                              backgroundColor: c,
                              borderColor: selectedColor === c ? "var(--foreground)" : "transparent",
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </Command>
              </PopoverContent>
            </Popover>

            {/* Clear all filters */}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4 mr-1" />
                Clear filters
              </Button>
            )}

            {/* Sort dropdown */}
            <Select value={sortOption} onValueChange={(v) => setSortOption(v as SortOption)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
                <SelectItem value="name">Name A–Z</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Grid */}
        {assistants.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Bot className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold mb-1">No agents yet</h2>
            <p className="text-sm text-muted-foreground max-w-md mb-4">
              Create your first agent to get started with the Agent Builder.
            </p>
            <Button onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-1.5" />
              Create Agent
            </Button>
          </div>
        ) : displayedAgents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-muted p-3 mb-4">
              <Search className="h-6 w-6 text-muted-foreground" />
            </div>
            <h2 className="text-sm font-medium mb-1">No matching agents</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Try adjusting your search or filter criteria
            </p>
            <Button variant="outline" size="sm" onClick={clearFilters}>
              Clear Filters
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {displayedAgents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                isDefault={isDefault(agent)}
                onClick={() => handleClick(agent)}
                onDuplicate={() => handleDuplicate(agent)}
                onSetDefault={() => handleSetDefault(agent)}
                onDelete={() => setDeleteTarget(agent)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Agent?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{deleteTarget?.name}&quot;. This action
              cannot be undone.
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
