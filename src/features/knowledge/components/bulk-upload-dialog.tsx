"use client"

import { useState, useRef, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
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
  CommandSeparator,
} from "@/components/ui/command"
import { Loader2, Upload, FileText, Folder, Check, Plus, Sparkles, ChevronsUpDown, X, FileCode, FileSpreadsheet, Box, AlertCircle, RefreshCw } from "@/lib/icons"
import { CategoryDialog, Category } from "./category-dialog"
import { xhrUpload } from "./upload-xhr"
import { cn } from "@/lib/utils"

interface BulkUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  knowledgeBases?: Array<{ id: string; name: string; color?: string | null }>
  categories?: Category[]
  onCategoriesChange?: () => void
}

type FileStatus = "idle" | "pending" | "uploading" | "processing" | "success" | "failed"

interface FileEntry {
  id: string
  file: File
  title: string
  status: FileStatus
  uploadProgress: number
  startedAt?: number
  finishedAt?: number
  error?: string
  documentId?: string
}

const CONCURRENCY = 2

function formatEta(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return ""
  const s = Math.max(1, Math.round(seconds))
  if (s < 60) return `~${s}s left`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return rem === 0 ? `~${m}m left` : `~${m}m ${rem}s left`
}

const TITLE_PREVIEW_MAX = 40

function truncateTitle(title: string): string {
  if (title.length <= TITLE_PREVIEW_MAX) return title
  return title.slice(0, TITLE_PREVIEW_MAX - 1).trimEnd() + "…"
}

const VALID_EXTENSIONS = [
  ".pdf", ".docx", ".doc", ".pptx", ".ppt", ".rtf", ".epub", ".odt",
  ".xlsx", ".xls", ".ods", ".csv", ".tsv", ".json", ".jsonl",
  ".md", ".txt", ".log", ".html", ".xml", ".yaml", ".toml", ".ini", ".env",
  ".gltf", ".glb",
  ".js", ".jsx", ".ts", ".tsx", ".py", ".rb", ".go", ".rs", ".java", ".c", ".cpp", ".h", ".hpp", ".cs", ".php", ".pl", ".sh", ".bat", ".ps1",
]

function FileStatusBadge({ status, error }: { status: FileStatus; error?: string }) {
  switch (status) {
    case "pending":
      return <span className="text-xs text-muted-foreground shrink-0">Queued</span>
    case "uploading":
      return <span className="text-xs text-muted-foreground shrink-0">Uploading…</span>
    case "processing":
      return (
        <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
          <Loader2 className="h-3 w-3 animate-spin" />
          Processing…
        </span>
      )
    case "success":
      return <Check className="h-4 w-4 text-green-600 shrink-0" />
    case "failed":
      return (
        <AlertCircle className="h-4 w-4 text-destructive shrink-0" aria-label={error || "Failed"} />
      )
    default:
      return null
  }
}

function getFileIcon(filename: string): { Icon: typeof FileText; color: string } {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf("."))
  if ([".pdf"].includes(ext)) return { Icon: FileText, color: "text-red-500" }
  if ([".xlsx", ".xls", ".ods", ".csv", ".tsv"].includes(ext)) return { Icon: FileSpreadsheet, color: "text-green-500" }
  if ([".docx", ".doc", ".rtf", ".odt"].includes(ext)) return { Icon: FileText, color: "text-blue-500" }
  if ([".pptx", ".ppt"].includes(ext)) return { Icon: FileText, color: "text-orange-500" }
  if ([".js", ".jsx", ".ts", ".tsx", ".py", ".rb", ".go", ".rs", ".java", ".c", ".cpp", ".h", ".hpp", ".cs", ".php", ".pl", ".sh", ".bat", ".ps1"].includes(ext)) return { Icon: FileCode, color: "text-purple-500" }
  if ([".gltf", ".glb"].includes(ext)) return { Icon: Box, color: "text-cyan-500" }
  return { Icon: FileText, color: "text-blue-500" }
}

export function BulkUploadDialog({
  open,
  onOpenChange,
  onSuccess,
  knowledgeBases = [],
  categories: availableCategories = [],
  onCategoriesChange,
}: BulkUploadDialogProps) {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [subcategory, setSubcategory] = useState("")
  const [selectedKBIds, setSelectedKBIds] = useState<string[]>([])
  const [enableEnhanced, setEnableEnhanced] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [showResults, setShowResults] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)
  const filesRef = useRef<FileEntry[]>([])
  filesRef.current = files

  const toggleCategory = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    )
  }

  const toggleKB = (kbId: string) => {
    setSelectedKBIds((prev) =>
      prev.includes(kbId) ? prev.filter((id) => id !== kbId) : [...prev, kbId]
    )
  }

  const handleCategoryCreated = () => {
    setCategoryDialogOpen(false)
    onCategoriesChange?.()
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputFiles = e.target.files
    if (!inputFiles) return

    const newEntries: FileEntry[] = []
    for (const file of Array.from(inputFiles)) {
      const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."))
      if (!VALID_EXTENSIONS.includes(ext)) {
        setError(`Unsupported file type: ${file.name}`)
        continue
      }
      newEntries.push({
        id: crypto.randomUUID(),
        file,
        title: file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "),
        status: "idle",
        uploadProgress: 0,
      })
    }

    if (newEntries.length > 0) {
      setFiles((prev) => [...prev, ...newEntries])
      setError("")
    }
  }

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  const updateTitle = (id: string, title: string) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, title } : f)))
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const droppedFiles = Array.from(e.dataTransfer.files)
    const newEntries: FileEntry[] = []
    for (const file of droppedFiles) {
      const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."))
      if (!VALID_EXTENSIONS.includes(ext)) {
        setError(`Unsupported file type: ${file.name}`)
        continue
      }
      newEntries.push({
        id: crypto.randomUUID(),
        file,
        title: file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "),
        status: "idle",
        uploadProgress: 0,
      })
    }
    if (newEntries.length > 0) {
      setFiles((prev) => [...prev, ...newEntries])
      setError("")
    }
  }

  const updateEntry = useCallback((id: string, patch: Partial<FileEntry>) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }, [])

  const runWorkers = useCallback(async () => {
    const queueIds: string[] = filesRef.current
      .filter((f) => f.status === "pending")
      .map((f) => f.id)

    let cursor = 0
    const claim = (): string | null => {
      if (cursor >= queueIds.length) return null
      return queueIds[cursor++]
    }

    const sharedCategoriesJson = JSON.stringify(selectedCategories)
    const sharedGroupsJson = JSON.stringify(selectedKBIds)
    const url = enableEnhanced
      ? "/api/dashboard/files?enhanced=true"
      : "/api/dashboard/files"

    const worker = async () => {
      while (true) {
        const id = claim()
        if (id === null) return
        const entry = filesRef.current.find((f) => f.id === id)
        if (!entry) continue

        updateEntry(id, { status: "uploading", startedAt: Date.now(), uploadProgress: 0, error: undefined })

        const formData = new FormData()
        formData.append("file", entry.file)
        if (entry.title) formData.append("title", entry.title)
        if (selectedCategories.length > 0) formData.append("categories", sharedCategoriesJson)
        if (subcategory) formData.append("subcategory", subcategory)
        if (selectedKBIds.length > 0) formData.append("groupIds", sharedGroupsJson)

        try {
          const res = await xhrUpload(url, formData, (frac) => {
            updateEntry(id, {
              uploadProgress: frac,
              status: frac >= 1 ? "processing" : "uploading",
            })
          })
          if (res.ok) {
            const body = res.body as { id?: string } | null
            updateEntry(id, {
              status: "success",
              uploadProgress: 1,
              finishedAt: Date.now(),
              documentId: body?.id,
            })
          } else {
            const body = res.body as { error?: string } | null
            updateEntry(id, {
              status: "failed",
              finishedAt: Date.now(),
              error: body?.error || `Upload failed (HTTP ${res.status})`,
            })
          }
        } catch (err) {
          updateEntry(id, {
            status: "failed",
            finishedAt: Date.now(),
            error: err instanceof Error ? err.message : "Upload failed",
          })
        }
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
  }, [selectedCategories, selectedKBIds, subcategory, enableEnhanced, updateEntry])

  const handleSubmit = async () => {
    if (files.length === 0) {
      setError("Please select at least one file")
      return
    }

    setLoading(true)
    setError("")
    // Mark everything not-yet-uploaded as pending so workers pick them up.
    setFiles((prev) =>
      prev.map((f) =>
        f.status === "success" ? f : { ...f, status: "pending", uploadProgress: 0, error: undefined, startedAt: undefined, finishedAt: undefined }
      )
    )

    // Let React commit the pending state before workers read filesRef.
    await new Promise((r) => setTimeout(r, 0))

    try {
      await runWorkers()
    } finally {
      setLoading(false)
      setShowResults(true)
      onSuccess()
    }
  }

  const retryFailed = async () => {
    if (loading) return
    if (!files.some((f) => f.status === "failed")) return
    setShowResults(false)
    setLoading(true)
    setError("")
    setFiles((prev) =>
      prev.map((f) =>
        f.status === "failed"
          ? { ...f, status: "pending", uploadProgress: 0, error: undefined, startedAt: undefined, finishedAt: undefined }
          : f
      )
    )
    await new Promise((r) => setTimeout(r, 0))
    try {
      await runWorkers()
    } finally {
      setLoading(false)
      setShowResults(true)
    }
  }

  const handleClose = () => {
    if (loading) return // block close while uploads are in flight
    if (showResults) {
      setShowResults(false)
      setFiles([])
      setSelectedCategories([])
      setSubcategory("")
      setSelectedKBIds([])
      setEnableEnhanced(true)
      setError("")
      onOpenChange(false)
    } else {
      onOpenChange(false)
    }
  }

  const succeededCount = files.filter((f) => f.status === "success").length
  const failedCount = files.filter((f) => f.status === "failed").length
  const doneCount = succeededCount + failedCount
  const aggregateValue =
    files.length === 0
      ? 0
      : (files.reduce(
          (sum, f) =>
            sum +
            (f.status === "success" || f.status === "failed"
              ? 1
              : f.status === "processing"
                ? 1
                : f.status === "uploading"
                  ? f.uploadProgress
                  : 0),
          0
        ) /
          files.length) *
        100
  const finishedDurations = files
    .filter((f) => (f.status === "success" || f.status === "failed") && f.startedAt && f.finishedAt)
    .map((f) => (f.finishedAt as number) - (f.startedAt as number))
  const avgDurationMs =
    finishedDurations.length > 0
      ? finishedDurations.reduce((a, b) => a + b, 0) / finishedDurations.length
      : 0
  const remainingCount = files.length - doneCount
  const etaText =
    avgDurationMs > 0 && remainingCount > 0
      ? formatEta((avgDurationMs * remainingCount) / 1000 / CONCURRENCY)
      : ""

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && loading) return // block Radix-driven close
        if (!next) handleClose()
      }}
    >
      <DialogContent className="gap-4 p-6 w-[calc(100vw-2rem)] max-w-[42rem] sm:max-w-[42rem] max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Bulk Upload Documents</DialogTitle>
          <DialogDescription>
            Upload multiple files at once. Each file can have its own title.
          </DialogDescription>
        </DialogHeader>

        {!showResults ? (
          <>
            {loading && (
              <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">
                    Uploading {doneCount} of {files.length}
                  </span>
                  {etaText && <span className="text-xs text-muted-foreground">{etaText}</span>}
                </div>
                <Progress value={aggregateValue} />
              </div>
            )}

            {!loading && (
              <div
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={VALID_EXTENSIONS.join(",")}
                  className="hidden"
                  onChange={handleFileInputChange}
                />
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Drag and drop files here, or click to browse
                </p>
              </div>
            )}

            {files.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Files ({files.length})</Label>
                  {!loading && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setFiles([])}
                      className="text-xs text-muted-foreground"
                    >
                      Clear all
                    </Button>
                  )}
                </div>
                <div className="max-h-[260px] overflow-y-auto space-y-2">
                  {files.map((entry) => {
                    const { Icon, color } = getFileIcon(entry.file.name)
                    return (
                      <div key={entry.id} className="flex flex-col gap-1 p-2 rounded-lg border bg-muted/30 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <Icon className={cn("h-5 w-5 shrink-0", color)} />
                          {loading ? (
                            <span
                              className="flex-1 min-w-0 text-sm truncate"
                              title={entry.title || entry.file.name}
                            >
                              {truncateTitle(entry.title || entry.file.name)}
                            </span>
                          ) : (
                            <Input
                              value={entry.title}
                              onChange={(e) => updateTitle(entry.id, e.target.value)}
                              className="flex-1 min-w-0 h-7 text-sm"
                              placeholder="Title"
                            />
                          )}
                          <span className="text-xs text-muted-foreground shrink-0">
                            {(entry.file.size / 1024).toFixed(1)} KB
                          </span>
                          <FileStatusBadge status={entry.status} error={entry.error} />
                          {!loading && entry.status !== "uploading" && entry.status !== "processing" && (
                            <button
                              type="button"
                              onClick={() => removeFile(entry.id)}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                        {entry.status === "uploading" && (
                          <Progress value={entry.uploadProgress * 100} className="h-1" />
                        )}
                        {entry.status === "failed" && entry.error && (
                          <p className="text-xs text-destructive pl-7 truncate" title={entry.error}>
                            {entry.error}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {files.length > 0 && !loading && (
              <>
                <div className="space-y-2">
                  <Label>Categories (optional)</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" className="w-full justify-between h-auto min-h-9 font-normal">
                        {selectedCategories.length > 0 ? (
                          <div className="flex gap-1 flex-wrap">
                            {selectedCategories.map((name) => {
                              const cat = availableCategories.find((c) => c.name === name)
                              return (
                                <Badge key={name} variant="default" className="text-xs" style={cat ? { backgroundColor: cat.color, borderColor: cat.color } : undefined}>
                                  {cat?.label ?? name}
                                </Badge>
                              )
                            })}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Apply to all files...</span>
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
                                <CommandItem key={cat.name} value={cat.label} onSelect={() => toggleCategory(cat.name)} className="cursor-pointer">
                                  <div className="h-4 w-4 rounded border shrink-0 mr-2 flex items-center justify-center" style={{ borderColor: cat.color, backgroundColor: isSelected ? `${cat.color}30` : "transparent" }}>
                                    {isSelected && <Check className="h-3 w-3" style={{ color: cat.color }} />}
                                  </div>
                                  <span>{cat.label}</span>
                                </CommandItem>
                              )
                            })}
                          </CommandGroup>
                          <CommandSeparator />
                          <CommandGroup>
                            <CommandItem onSelect={() => setCategoryDialogOpen(true)} className="cursor-pointer">
                              <Plus className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                              <span>New category</span>
                            </CommandItem>
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bulk-subcategory">Subcategory (optional, applies to all)</Label>
                  <Input
                    id="bulk-subcategory"
                    value={subcategory}
                    onChange={(e) => setSubcategory(e.target.value)}
                    placeholder="e.g., Product Manual"
                  />
                </div>

                {knowledgeBases.length > 0 && (
                  <div className="space-y-2">
                    <Label>Knowledge Bases (applies to all)</Label>
                    <div className="grid grid-cols-2 gap-2 max-h-[120px] overflow-y-auto rounded-lg border p-2">
                      {knowledgeBases.map((kb) => {
                        const isSelected = selectedKBIds.includes(kb.id)
                        return (
                          <button
                            key={kb.id}
                            type="button"
                            onClick={() => toggleKB(kb.id)}
                            className={cn("flex items-center gap-2 p-2 rounded-md text-sm transition-colors text-left", isSelected ? "bg-primary/10 border border-primary" : "border border-transparent hover:bg-muted")}
                          >
                            <div className="h-4 w-4 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: kb.color ?? "var(--chart-3)" }}>
                              {isSelected ? <Check className="h-3 w-3 text-white" /> : <Folder className="h-2.5 w-2.5 text-white" />}
                            </div>
                            <span className="truncate flex-1">{kb.name}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-chart-1" />
                    <div>
                      <Label htmlFor="bulk-enhanced" className="text-sm font-medium cursor-pointer">Enhanced Processing</Label>
                      <p className="text-xs text-muted-foreground">Extract entities for knowledge graph</p>
                    </div>
                  </div>
                  <Switch id="bulk-enhanced" checked={enableEnhanced} onCheckedChange={setEnableEnhanced} />
                </div>
              </>
            )}

            {error && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <p>{error}</p>
              </div>
            )}

            <CategoryDialog
              open={categoryDialogOpen}
              onOpenChange={setCategoryDialogOpen}
              onSuccess={handleCategoryCreated}
            />
          </>
        ) : (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-green-600">
                <Check className="h-5 w-5" />
                <span className="font-medium">{succeededCount} succeeded</span>
              </div>
              {failedCount > 0 && (
                <div className="flex items-center gap-2 text-red-600">
                  <X className="h-5 w-5" />
                  <span className="font-medium">{failedCount} failed</span>
                </div>
              )}
            </div>

            {failedCount > 0 && (
              <div className="space-y-2">
                <Label>Failed files:</Label>
                <div className="max-h-[200px] overflow-y-auto space-y-1">
                  {files.filter((f) => f.status === "failed").map((f) => (
                    <div key={f.id} className="flex items-start gap-2 p-2 rounded border bg-destructive/10 text-sm min-w-0">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-destructive" />
                      <div className="min-w-0 flex-1">
                        <span className="font-medium block truncate" title={f.file.name}>
                          {truncateTitle(f.file.name)}
                        </span>
                        <p className="text-xs text-muted-foreground truncate" title={f.error}>
                          {f.error}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            {showResults ? "Close" : "Cancel"}
          </Button>
          {showResults && failedCount > 0 && (
            <Button variant="secondary" onClick={retryFailed} disabled={loading}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry failed ({failedCount})
            </Button>
          )}
          {!showResults && (
            <Button onClick={handleSubmit} disabled={loading || files.length === 0}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {loading ? "Uploading..." : `Upload ${files.length} file${files.length !== 1 ? "s" : ""}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}