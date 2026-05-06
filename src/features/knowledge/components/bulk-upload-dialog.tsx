"use client"

import { useState, useRef } from "react"
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
import { Loader2, Upload, FileText, Folder, Check, Plus, Sparkles, ChevronsUpDown, X, FileCode, FileSpreadsheet, Box, AlertCircle } from "@/lib/icons"
import { CategoryDialog, Category } from "./category-dialog"
import { cn } from "@/lib/utils"

interface BulkUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  knowledgeBases?: Array<{ id: string; name: string; color?: string | null }>
  categories?: Category[]
  onCategoriesChange?: () => void
}

interface FileEntry {
  id: string
  file: File
  title: string
}

const VALID_EXTENSIONS = [
  ".pdf", ".docx", ".doc", ".pptx", ".ppt", ".rtf", ".epub", ".odt",
  ".xlsx", ".xls", ".ods", ".csv", ".tsv", ".json", ".jsonl",
  ".md", ".txt", ".log", ".html", ".xml", ".yaml", ".toml", ".ini", ".env",
  ".gltf", ".glb",
  ".js", ".jsx", ".ts", ".tsx", ".py", ".rb", ".go", ".rs", ".java", ".c", ".cpp", ".h", ".hpp", ".cs", ".php", ".pl", ".sh", ".bat", ".ps1",
]

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
  const [results, setResults] = useState<{ filename: string; success: boolean; error?: string }[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)

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
      })
    }
    if (newEntries.length > 0) {
      setFiles((prev) => [...prev, ...newEntries])
      setError("")
    }
  }

  const handleSubmit = async () => {
    if (files.length === 0) {
      setError("Please select at least one file")
      return
    }

    setLoading(true)
    setError("")

    const formData = new FormData()
    files.forEach((entry) => {
      formData.append("files", entry.file)
      formData.append("titles", entry.title)
    })
    if (selectedCategories.length > 0) {
      formData.append("categories", JSON.stringify(selectedCategories))
    }
    if (subcategory) formData.append("subcategory", subcategory)
    if (selectedKBIds.length > 0) formData.append("groupIds", JSON.stringify(selectedKBIds))

    const url = enableEnhanced
      ? "/api/dashboard/files/bulk?enhanced=true"
      : "/api/dashboard/files/bulk"

    try {
      const response = await fetch(url, {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Upload failed")
      }

      const data = await response.json()
      setResults(data.results)
      setShowResults(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (showResults) {
      setShowResults(false)
      setResults([])
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

  const succeededCount = results.filter((r) => r.success).length
  const failedCount = results.filter((r) => !r.success).length

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="gap-4 p-6 max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Bulk Upload Documents</DialogTitle>
          <DialogDescription>
            Upload multiple files at once. Each file can have its own title.
          </DialogDescription>
        </DialogHeader>

        {!showResults ? (
          <>
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

            {files.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Files ({files.length})</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFiles([])}
                    className="text-xs text-muted-foreground"
                  >
                    Clear all
                  </Button>
                </div>
                <div className="max-h-[200px] overflow-y-auto space-y-2">
                  {files.map((entry) => {
                    const { Icon, color } = getFileIcon(entry.file.name)
                    return (
                      <div key={entry.id} className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30">
                        <Icon className={cn("h-5 w-5 shrink-0", color)} />
                        <Input
                          value={entry.title}
                          onChange={(e) => updateTitle(entry.id, e.target.value)}
                          className="flex-1 h-7 text-sm"
                          placeholder="Title"
                        />
                        <span className="text-xs text-muted-foreground shrink-0">
                          {(entry.file.size / 1024).toFixed(1)} KB
                        </span>
                        <button
                          type="button"
                          onClick={() => removeFile(entry.id)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {files.length > 0 && (
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
                  {results.filter((r) => !r.success).map((r) => (
                    <div key={r.filename} className="flex items-start gap-2 p-2 rounded border bg-destructive/10 text-sm">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-destructive" />
                      <div>
                        <span className="font-medium">{r.filename}</span>
                        <p className="text-xs text-muted-foreground">{r.error}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose}>
            {showResults ? "Close" : "Cancel"}
          </Button>
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