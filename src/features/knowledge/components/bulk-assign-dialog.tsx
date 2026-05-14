"use client"

import { useOrgFetch } from "@/hooks/use-organization"

import { useEffect, useState, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "@/components/ui/progress"
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
} from "@/components/ui/command"
import { Loader2, Folder, Check, ChevronsUpDown, AlertCircle, X } from "@/lib/icons"
import { cn } from "@/lib/utils"
import type { Category } from "./category-dialog"
import type { Document, KnowledgeBase } from "./pages/knowledge-page-client"

type OrphanFilter = "either" | "no-category" | "no-kb"

const CONCURRENCY = 5

interface BulkAssignDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  documents: Document[]
  categories: Category[]
  knowledgeBases: KnowledgeBase[]
  onSuccess: () => void
  /**
   * When provided, the dialog targets exactly these document ids (used by the
   * list's selection-mode bulk-edit). Filter tabs are hidden and the orphan
   * heuristic is bypassed — the user already chose what to edit.
   */
  presetDocIds?: string[]
}

function matchesOrphan(doc: Document, filter: OrphanFilter): boolean {
  if (filter === "no-category") return doc.categories.length === 0
  if (filter === "no-kb") return doc.groups.length === 0
  return doc.categories.length === 0 || doc.groups.length === 0
}

const TITLE_PREVIEW_MAX = 40

function truncateTitle(title: string): string {
  if (title.length <= TITLE_PREVIEW_MAX) return title
  return title.slice(0, TITLE_PREVIEW_MAX - 1).trimEnd() + "…"
}

export function BulkAssignDialog({
  open,
  onOpenChange,
  documents,
  categories: availableCategories,
  knowledgeBases,
  onSuccess,
  presetDocIds,
}: BulkAssignDialogProps) {
  const orgFetch = useOrgFetch()
  const usingPreset = presetDocIds !== undefined
  const [filter, setFilter] = useState<OrphanFilter>("either")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [selectedKBIds, setSelectedKBIds] = useState<string[]>([])
  const [removeCategories, setRemoveCategories] = useState<string[]>([])
  const [removeKBIds, setRemoveKBIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0 })

  const eitherCount = documents.filter((d) => matchesOrphan(d, "either")).length
  const noCategoryCount = documents.filter((d) => matchesOrphan(d, "no-category")).length
  const noKBCount = documents.filter((d) => matchesOrphan(d, "no-kb")).length

  // List the dialog renders: preset takes priority over the orphan filter.
  const presetSet = presetDocIds ? new Set(presetDocIds) : null
  const orphans = usingPreset
    ? documents.filter((d) => presetSet!.has(d.id))
    : documents.filter((d) => matchesOrphan(d, filter))

  // When the dialog opens (or the filter changes in orphan mode), default to all-selected.
  useEffect(() => {
    if (!open) return
    setSelectedIds(new Set(orphans.map((d) => d.id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filter, presetDocIds])

  // Reset everything when the dialog closes
  useEffect(() => {
    if (open) return
    setSelectedCategories([])
    setSelectedKBIds([])
    setRemoveCategories([])
    setRemoveKBIds([])
    setError("")
    setLoading(false)
    setProgress({ done: 0, total: 0, failed: 0 })
    setFilter("either")
  }, [open])

  const toggleDoc = (id: string) => {
    if (loading) return
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allSelected = orphans.length > 0 && orphans.every((d) => selectedIds.has(d.id))
  const toggleAll = () => {
    if (loading) return
    if (allSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(orphans.map((d) => d.id)))
  }

  const toggleCategory = (name: string) => {
    setSelectedCategories((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]
    )
  }

  const toggleKB = (id: string) => {
    setSelectedKBIds((prev) =>
      prev.includes(id) ? prev.filter((kb) => kb !== id) : [...prev, id]
    )
  }

  const toggleRemoveCategory = (name: string) => {
    setRemoveCategories((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]
    )
  }

  const toggleRemoveKB = (id: string) => {
    setRemoveKBIds((prev) =>
      prev.includes(id) ? prev.filter((kb) => kb !== id) : [...prev, id]
    )
  }

  // Categories / KBs actually present in the currently selected docs — the only
  // values worth offering for removal (removing one a doc doesn't have is a no-op).
  const targetsForPickers = documents.filter((d) => selectedIds.has(d.id))
  const presentCategoryNames = Array.from(
    new Set(targetsForPickers.flatMap((d) => d.categories))
  )
  const presentKBs = Array.from(
    new Map(
      targetsForPickers.flatMap((d) => d.groups.map((g) => [g.id, g] as const))
    ).values()
  )

  const handleClose = () => {
    if (loading) return
    onOpenChange(false)
  }

  const handleApply = useCallback(async () => {
    const targets = documents.filter((d) => selectedIds.has(d.id))
    if (targets.length === 0) {
      setError("Pick at least one file")
      return
    }
    if (
      selectedCategories.length === 0 &&
      selectedKBIds.length === 0 &&
      removeCategories.length === 0 &&
      removeKBIds.length === 0
    ) {
      setError("Pick at least one category or knowledge base to add or remove")
      return
    }
    setError("")
    setLoading(true)
    setProgress({ done: 0, total: targets.length, failed: 0 })

    const removeCategorySet = new Set(removeCategories)
    const removeKBSet = new Set(removeKBIds)
    const touchCategories = selectedCategories.length > 0 || removeCategories.length > 0
    const touchKBs = selectedKBIds.length > 0 || removeKBIds.length > 0

    let cursor = 0
    let done = 0
    let failed = 0
    const worker = async () => {
      while (true) {
        const idx = cursor++
        if (idx >= targets.length) return
        const doc = targets[idx]
        const body: Record<string, unknown> = {}
        if (touchCategories) {
          // (existing − remove) ∪ add
          const kept = doc.categories.filter((c) => !removeCategorySet.has(c))
          body.categories = Array.from(new Set([...kept, ...selectedCategories]))
        }
        if (touchKBs) {
          const keptIds = doc.groups
            .filter((g) => !removeKBSet.has(g.id))
            .map((g) => g.id)
          body.groupIds = Array.from(new Set([...keptIds, ...selectedKBIds]))
        }
        try {
          const res = await orgFetch(`/api/dashboard/files/${doc.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
          if (!res.ok) failed++
        } catch {
          failed++
        }
        done++
        setProgress({ done, total: targets.length, failed })
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))

    setLoading(false)
    onSuccess()
    if (failed === 0) {
      onOpenChange(false)
    } else {
      setError(`${failed} of ${targets.length} file${targets.length !== 1 ? "s" : ""} failed to update`)
    }
  }, [
    documents,
    selectedIds,
    selectedCategories,
    selectedKBIds,
    removeCategories,
    removeKBIds,
    onSuccess,
    onOpenChange,
  ])

  const applyDisabled =
    loading ||
    selectedIds.size === 0 ||
    (selectedCategories.length === 0 &&
      selectedKBIds.length === 0 &&
      removeCategories.length === 0 &&
      removeKBIds.length === 0)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && loading) return
        if (!next) handleClose()
      }}
    >
      <DialogContent className="gap-4 p-6 w-[calc(100vw-2rem)] max-w-[42rem] sm:max-w-[42rem] max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            {usingPreset
              ? "Edit selected files"
              : "Assign category or knowledge base to orphan files"}
          </DialogTitle>
          <DialogDescription>
            {usingPreset
              ? "Pick categories and/or knowledge bases to add to the selected files. Existing assignments are kept."
              : "Pick files that are missing a category or a knowledge base, then choose what to add. Existing assignments on each file are kept."}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                Updating {progress.done} of {progress.total}
                {progress.failed > 0 && (
                  <span className="text-destructive ml-2">· {progress.failed} failed</span>
                )}
              </span>
            </div>
            <Progress value={progress.total === 0 ? 0 : (progress.done / progress.total) * 100} />
          </div>
        )}

        {/* Filter tabs — only shown in orphan mode */}
        {!usingPreset && (
        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: "either" as const, label: `Missing either (${eitherCount})` },
              { id: "no-category" as const, label: `No category (${noCategoryCount})` },
              { id: "no-kb" as const, label: `No KB (${noKBCount})` },
            ]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => !loading && setFilter(tab.id)}
              disabled={loading}
              className={cn(
                "px-3 py-1 rounded-full text-xs border transition-colors",
                filter === tab.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:bg-muted",
                loading && "opacity-50 cursor-not-allowed"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        )}

        {/* Doc list */}
        <div className="space-y-2 min-w-0">
          <div className="flex items-center justify-between">
            <Label>
              Files ({selectedIds.size} of {orphans.length} selected)
            </Label>
            {orphans.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleAll}
                disabled={loading}
                className="text-xs text-muted-foreground"
              >
                {allSelected ? "Deselect all" : "Select all"}
              </Button>
            )}
          </div>
          <div className="max-h-[220px] overflow-y-auto space-y-1 rounded-lg border p-2 min-w-0">
            {orphans.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No orphan files in this view.
              </p>
            ) : (
              orphans.map((doc) => {
                const checked = selectedIds.has(doc.id)
                const visibleCats = doc.categories.slice(0, 3)
                const extraCats = doc.categories.length - visibleCats.length
                const visibleGroups = doc.groups.slice(0, 3)
                const extraGroups = doc.groups.length - visibleGroups.length
                return (
                  <label
                    key={doc.id}
                    className={cn(
                      "flex items-start gap-2 rounded p-1.5 text-sm min-w-0",
                      loading ? "opacity-70" : "cursor-pointer hover:bg-muted/50"
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleDoc(doc.id)}
                      disabled={loading}
                      className="shrink-0 mt-1"
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="truncate" title={doc.title}>
                        {truncateTitle(doc.title)}
                      </div>
                      <div className="flex items-center gap-1 flex-wrap text-[10px]">
                        {doc.categories.length === 0 ? (
                          <span className="text-muted-foreground italic">no category</span>
                        ) : (
                          <>
                            {visibleCats.map((catName) => {
                              const cat = availableCategories.find((c) => c.name === catName)
                              return (
                                <Badge
                                  key={catName}
                                  variant="outline"
                                  className="h-4 px-1 text-[10px] font-normal"
                                  style={cat ? { borderColor: cat.color, color: cat.color } : undefined}
                                >
                                  {cat?.label ?? catName}
                                </Badge>
                              )
                            })}
                            {extraCats > 0 && (
                              <span className="text-muted-foreground">+{extraCats}</span>
                            )}
                          </>
                        )}
                        <span className="text-muted-foreground/50">·</span>
                        {doc.groups.length === 0 ? (
                          <span className="text-muted-foreground italic">no KB</span>
                        ) : (
                          <>
                            {visibleGroups.map((g) => (
                              <Badge
                                key={g.id}
                                variant="outline"
                                className="h-4 px-1 text-[10px] font-normal gap-1"
                                style={g.color ? { borderColor: g.color } : undefined}
                              >
                                <Folder
                                  className="h-2.5 w-2.5"
                                  style={g.color ? { color: g.color } : undefined}
                                />
                                {g.name}
                              </Badge>
                            ))}
                            {extraGroups > 0 && (
                              <span className="text-muted-foreground">+{extraGroups}</span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </label>
                )
              })
            )}
          </div>
        </div>

        {/* Category picker */}
        <div className="space-y-2">
          <Label>Add category (optional)</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                disabled={loading}
                className="w-full justify-between h-auto min-h-9 font-normal"
              >
                {selectedCategories.length > 0 ? (
                  <div className="flex gap-1 flex-wrap">
                    {selectedCategories.map((name) => {
                      const cat = availableCategories.find((c) => c.name === name)
                      return (
                        <Badge
                          key={name}
                          variant="default"
                          className="text-xs"
                          style={cat ? { backgroundColor: cat.color, borderColor: cat.color } : undefined}
                        >
                          {cat?.label ?? name}
                        </Badge>
                      )
                    })}
                  </div>
                ) : (
                  <span className="text-muted-foreground">Pick categories to add…</span>
                )}
                <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]" align="start">
              <Command>
                <CommandInput placeholder="Search categories..." />
                <CommandList className="max-h-[180px] overflow-y-auto">
                  <CommandEmpty>No category found.</CommandEmpty>
                  <CommandGroup>
                    {availableCategories.map((cat) => {
                      const isSelected = selectedCategories.includes(cat.name)
                      return (
                        <CommandItem
                          key={cat.name}
                          value={cat.label}
                          onSelect={() => toggleCategory(cat.name)}
                          className="cursor-pointer"
                        >
                          <div
                            className="h-4 w-4 rounded border shrink-0 mr-2 flex items-center justify-center"
                            style={{
                              borderColor: cat.color,
                              backgroundColor: isSelected ? `${cat.color}30` : "transparent",
                            }}
                          >
                            {isSelected && <Check className="h-3 w-3" style={{ color: cat.color }} />}
                          </div>
                          <span>{cat.label}</span>
                        </CommandItem>
                      )
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* KB picker */}
        {knowledgeBases.length > 0 && (
          <div className="space-y-2">
            <Label>Add to knowledge base (optional)</Label>
            <div className="grid grid-cols-2 gap-2 max-h-[140px] overflow-y-auto rounded-lg border p-2">
              {knowledgeBases.map((kb) => {
                const isSelected = selectedKBIds.includes(kb.id)
                return (
                  <button
                    key={kb.id}
                    type="button"
                    onClick={() => !loading && toggleKB(kb.id)}
                    disabled={loading}
                    className={cn(
                      "flex items-center gap-2 p-2 rounded-md text-sm transition-colors text-left min-w-0",
                      isSelected
                        ? "bg-primary/10 border border-primary"
                        : "border border-transparent hover:bg-muted",
                      loading && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <div
                      className="h-4 w-4 rounded flex items-center justify-center shrink-0"
                      style={{ backgroundColor: kb.color ?? "var(--chart-3)" }}
                    >
                      {isSelected ? (
                        <Check className="h-3 w-3 text-white" />
                      ) : (
                        <Folder className="h-2.5 w-2.5 text-white" />
                      )}
                    </div>
                    <span className="truncate flex-1 min-w-0">{kb.name}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Remove-category picker — only lists categories present in the selection */}
        {presentCategoryNames.length > 0 && (
          <div className="space-y-2">
            <Label>Remove category (optional)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  disabled={loading}
                  className="w-full justify-between h-auto min-h-9 font-normal"
                >
                  {removeCategories.length > 0 ? (
                    <div className="flex gap-1 flex-wrap">
                      {removeCategories.map((name) => {
                        const cat = availableCategories.find((c) => c.name === name)
                        return (
                          <Badge
                            key={name}
                            variant="outline"
                            className="text-xs line-through"
                            style={cat ? { borderColor: cat.color, color: cat.color } : undefined}
                          >
                            {cat?.label ?? name}
                          </Badge>
                        )
                      })}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">Pick categories to remove…</span>
                  )}
                  <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]" align="start">
                <Command>
                  <CommandInput placeholder="Search categories..." />
                  <CommandList className="max-h-[180px] overflow-y-auto">
                    <CommandEmpty>No category found.</CommandEmpty>
                    <CommandGroup>
                      {presentCategoryNames.map((name) => {
                        const cat = availableCategories.find((c) => c.name === name)
                        const isSelected = removeCategories.includes(name)
                        return (
                          <CommandItem
                            key={name}
                            value={cat?.label ?? name}
                            onSelect={() => toggleRemoveCategory(name)}
                            className="cursor-pointer"
                          >
                            <div
                              className="h-4 w-4 rounded border shrink-0 mr-2 flex items-center justify-center"
                              style={{
                                borderColor: cat?.color ?? "var(--muted-foreground)",
                                backgroundColor: isSelected ? `${cat?.color ?? "var(--muted-foreground)"}30` : "transparent",
                              }}
                            >
                              {isSelected && (
                                <Check className="h-3 w-3" style={{ color: cat?.color }} />
                              )}
                            </div>
                            <span>{cat?.label ?? name}</span>
                          </CommandItem>
                        )
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        )}

        {/* Remove-KB picker — only lists KBs present in the selection */}
        {presentKBs.length > 0 && (
          <div className="space-y-2">
            <Label>Remove from knowledge base (optional)</Label>
            <div className="grid grid-cols-2 gap-2 max-h-[140px] overflow-y-auto rounded-lg border p-2">
              {presentKBs.map((kb) => {
                const isSelected = removeKBIds.includes(kb.id)
                return (
                  <button
                    key={kb.id}
                    type="button"
                    onClick={() => !loading && toggleRemoveKB(kb.id)}
                    disabled={loading}
                    className={cn(
                      "flex items-center gap-2 p-2 rounded-md text-sm transition-colors text-left min-w-0",
                      isSelected
                        ? "bg-destructive/10 border border-destructive"
                        : "border border-transparent hover:bg-muted",
                      loading && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <div
                      className="h-4 w-4 rounded flex items-center justify-center shrink-0"
                      style={{ backgroundColor: kb.color ?? "var(--chart-3)" }}
                    >
                      {isSelected ? (
                        <X className="h-3 w-3 text-white" />
                      ) : (
                        <Folder className="h-2.5 w-2.5 text-white" />
                      )}
                    </div>
                    <span className={cn("truncate flex-1 min-w-0", isSelected && "line-through")}>
                      {kb.name}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        <DialogFooter className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={applyDisabled}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {loading
              ? "Applying…"
              : `Apply to ${selectedIds.size} file${selectedIds.size !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
