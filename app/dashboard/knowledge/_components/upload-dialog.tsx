"use client"

import { useState, useRef, useEffect } from "react"
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
import { Loader2, Upload, FileText, Folder, Check, Image, FileType, Plus, Sparkles, ChevronsUpDown, X, FileCode, FileSpreadsheet, BookOpen, Info, Box } from "lucide-react"
import { CategoryDialog, Category } from "./category-dialog"
import { cn } from "@/lib/utils"

// ─── Supported formats data ────────────────────────────────────────────────────
const SUPPORTED_FORMAT_GROUPS = [
  {
    label: "Documents",
    icon: FileType,
    color: "text-red-500",
    formats: [
      { ext: ".pdf", desc: "PDF" },
      { ext: ".docx", desc: "Word" },
      { ext: ".doc", desc: "Word (Legacy)" },
      { ext: ".pptx", desc: "PowerPoint" },
      { ext: ".ppt", desc: "PowerPoint (Legacy)" },
      { ext: ".rtf", desc: "Rich Text" },
      { ext: ".epub", desc: "eBook" },
      { ext: ".odt", desc: "OpenDocument Text" },
    ],
  },
  {
    label: "Spreadsheets & Data",
    icon: FileSpreadsheet,
    color: "text-green-500",
    formats: [
      { ext: ".xlsx", desc: "Excel" },
      { ext: ".xls", desc: "Excel (Legacy)" },
      { ext: ".ods", desc: "OpenDocument Sheet" },
      { ext: ".csv", desc: "CSV" },
      { ext: ".tsv", desc: "TSV" },
      { ext: ".json", desc: "JSON" },
      { ext: ".jsonl", desc: "JSONL" },
    ],
  },
  {
    label: "Text & Markup",
    icon: FileText,
    color: "text-blue-500",
    formats: [
      { ext: ".md", desc: "Markdown" },
      { ext: ".txt", desc: "Plain Text" },
      { ext: ".log", desc: "Log File" },
      { ext: ".html", desc: "HTML" },
      { ext: ".xml", desc: "XML" },
      { ext: ".yaml", desc: "YAML" },
      { ext: ".toml", desc: "TOML" },
      { ext: ".ini", desc: "INI Config" },
      { ext: ".env", desc: "Env File" },
    ],
  },
  {
    label: "3D Models",
    icon: Box,
    color: "text-cyan-500",
    formats: [
      { ext: ".gltf", desc: "glTF" },
      { ext: ".glb", desc: "glTF Binary" },
    ],
  },
  {
    label: "Code",
    icon: FileCode,
    color: "text-purple-500",
    formats: [
      { ext: ".py", desc: "Python" },
      { ext: ".ts", desc: "TypeScript" },
      { ext: ".js", desc: "JavaScript" },
      { ext: ".go", desc: "Go" },
      { ext: ".rs", desc: "Rust" },
      { ext: ".java", desc: "Java" },
      { ext: ".rb", desc: "Ruby" },
      { ext: ".php", desc: "PHP" },
      { ext: ".sh", desc: "Shell" },
      { ext: ".sql", desc: "SQL" },
      { ext: ".swift", desc: "Swift" },
      { ext: ".kt", desc: "Kotlin" },
      { ext: ".c", desc: "C" },
      { ext: ".cpp", desc: "C++" },
    ],
  },
  {
    label: "Images (OCR)",
    icon: Image,
    color: "text-amber-500",
    formats: [
      { ext: ".png", desc: "PNG" },
      { ext: ".jpg", desc: "JPEG" },
      { ext: ".webp", desc: "WebP" },
      { ext: ".gif", desc: "GIF" },
      { ext: ".heic", desc: "HEIC" },
    ],
  },
]

function SupportedFormatsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Supported File Formats</DialogTitle>
          <DialogDescription>
            All formats are extracted to text and indexed for semantic search.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          {SUPPORTED_FORMAT_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="flex items-center gap-1.5 mb-2">
                <group.icon className={cn("h-3.5 w-3.5", group.color)} />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {group.label}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {group.formats.map((f) => (
                  <Badge key={f.ext} variant="secondary" className="text-xs font-mono gap-1">
                    {f.ext}
                    <span className="text-muted-foreground font-sans">{f.desc}</span>
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── All accepted extensions (for validation + input accept attr) ─────────────
const VALID_EXTENSIONS = [
  // Documents
  ".pdf", ".docx", ".doc", ".pptx", ".ppt", ".rtf", ".epub", ".odt",
  // Spreadsheets & data
  ".xlsx", ".xls", ".ods", ".csv", ".tsv", ".json", ".jsonl",
  // Text & markup
  ".md", ".markdown", ".txt", ".log", ".html", ".htm", ".xml", ".yaml", ".yml", ".toml", ".ini", ".env",
  // Code
  ".py", ".ts", ".tsx", ".js", ".jsx", ".go", ".rs", ".java",
  ".c", ".cpp", ".h", ".rb", ".php", ".sh", ".sql", ".r", ".swift", ".kt",
  // Images
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic",
  // 3D Models
  ".gltf", ".glb",
]

interface KnowledgeBase {
  id: string
  name: string
  description?: string | null
  color: string | null
  documentCount?: number
}

interface UploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  knowledgeBases?: KnowledgeBase[]
  defaultKBIds?: string[]
  categories: Category[]
  onCategoriesChange: () => void
}

function getFileIcon(fileName: string) {
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."))

  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic"].includes(ext)) {
    return { Icon: Image, color: "text-amber-500" }
  }
  if (ext === ".pdf") {
    return { Icon: FileType, color: "text-red-500" }
  }
  if ([".docx", ".doc", ".pptx", ".ppt", ".rtf", ".epub", ".odt"].includes(ext)) {
    return { Icon: BookOpen, color: "text-red-400" }
  }
  if ([".xlsx", ".xls", ".ods", ".csv", ".tsv", ".json", ".jsonl"].includes(ext)) {
    return { Icon: FileSpreadsheet, color: "text-green-500" }
  }
  if ([".py", ".ts", ".tsx", ".js", ".jsx", ".go", ".rs", ".java", ".c", ".cpp", ".h", ".rb", ".php", ".sh", ".sql", ".swift", ".kt"].includes(ext)) {
    return { Icon: FileCode, color: "text-purple-500" }
  }
  if ([".gltf", ".glb"].includes(ext)) {
    return { Icon: Box, color: "text-cyan-500" }
  }
  return { Icon: FileText, color: "text-blue-500" }
}

export function UploadDialog({
  open,
  onOpenChange,
  onSuccess,
  knowledgeBases = [],
  defaultKBIds = [],
  categories: availableCategories,
  onCategoriesChange,
}: UploadDialogProps) {
  const [loading, setLoading] = useState(false)
  const [title, setTitle] = useState("")
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [subcategory, setSubcategory] = useState("")
  const [selectedKBIds, setSelectedKBIds] = useState<string[]>([])
  const [error, setError] = useState("")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [enableEnhanced, setEnableEnhanced] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)
  const [formatsDialogOpen, setFormatsDialogOpen] = useState(false)

  useEffect(() => {
    if (open) {
      setSelectedKBIds(defaultKBIds)
    }
  }, [open, defaultKBIds])

  const resetForm = () => {
    setTitle("")
    setSelectedCategories([])
    setSubcategory("")
    setSelectedKBIds(defaultKBIds)
    setSelectedFile(null)
    setError("")
    setEnableEnhanced(true)
  }

  const toggleCategory = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    )
  }

  const handleCategoryCreated = () => {
    setCategoryDialogOpen(false)
    onCategoriesChange()
  }

  const toggleKB = (kbId: string) => {
    setSelectedKBIds((prev) =>
      prev.includes(kbId) ? prev.filter((id) => id !== kbId) : [...prev, kbId]
    )
  }

  const handleFileSelect = (file: File) => {
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."))

    if (!VALID_EXTENSIONS.includes(ext)) {
      setError("Unsupported file type. Click \"Supported formats\" to see what's accepted.")
      return
    }

    setSelectedFile(file)
    setError("")

    if (!title) {
      const name = file.name.replace(/\.[^/.]+$/, "")
      setTitle(name.replace(/[-_]/g, " "))
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (selectedCategories.length === 0) {
      setError("At least one category is required")
      return
    }

    if (!selectedFile) {
      setError("Please select a file")
      return
    }

    setLoading(true)
    try {
      const formData = new FormData()
      formData.append("file", selectedFile)
      formData.append("title", title || selectedFile.name.replace(/\.[^/.]+$/, ""))
      formData.append("categories", JSON.stringify(selectedCategories))
      if (subcategory) formData.append("subcategory", subcategory)
      if (selectedKBIds.length > 0) formData.append("groupIds", JSON.stringify(selectedKBIds))

      const url = enableEnhanced
        ? "/api/dashboard/knowledge?enhanced=true"
        : "/api/dashboard/knowledge"

      const response = await fetch(url, {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to upload document")
      }

      resetForm()
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload document")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open) resetForm()
        onOpenChange(open)
      }}
    >
      <DialogContent className="flex max-h-[90vh] max-w-lg flex-col gap-4 overflow-hidden p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Upload Document</DialogTitle>
          <DialogDescription>
            Upload a file to add to the knowledge base.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <form id="upload-document-form" onSubmit={handleSubmit} className="space-y-4">
          {/* File Upload Area */}
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer",
              dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25",
              selectedFile ? "bg-muted/50" : "hover:border-primary/50"
            )}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => !selectedFile && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={VALID_EXTENSIONS.join(",")}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFileSelect(file)
              }}
            />

            {selectedFile ? (
              <div className="space-y-2">
                {(() => {
                  const { Icon, color } = getFileIcon(selectedFile.name)
                  return <Icon className={cn("h-10 w-10 mx-auto", color)} />
                })()}
                <p className="font-medium">{selectedFile.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedFile(null)
                    setTitle("")
                  }}
                >
                  Remove
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
                <p className="text-muted-foreground">
                  Drag and drop or <span className="text-primary">browse</span>
                </p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setFormatsDialogOpen(true)
                  }}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                >
                  <Info className="h-3 w-3" />
                  Supported formats
                </button>
              </div>
            )}
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Document title (auto-filled from filename)"
            />
          </div>

          {/* Categories */}
          <div className="space-y-2">
            <Label>Categories</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
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
                            <span
                              role="button"
                              tabIndex={0}
                              className="ml-1 hover:opacity-70 cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleCategory(name)
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.stopPropagation()
                                  toggleCategory(name)
                                }
                              }}
                            >
                              <X className="h-2.5 w-2.5" />
                            </span>
                          </Badge>
                        )
                      })}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">Select categories...</span>
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
                    <CommandSeparator />
                    <CommandGroup>
                      <CommandItem
                        onSelect={() => setCategoryDialogOpen(true)}
                        className="cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                        <span>New category</span>
                      </CommandItem>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <CategoryDialog
            open={categoryDialogOpen}
            onOpenChange={setCategoryDialogOpen}
            onSuccess={handleCategoryCreated}
          />

          <SupportedFormatsDialog
            open={formatsDialogOpen}
            onOpenChange={setFormatsDialogOpen}
          />

          {/* Subcategory */}
          <div className="space-y-2">
            <Label htmlFor="subcategory">Subcategory (optional)</Label>
            <Input
              id="subcategory"
              value={subcategory}
              onChange={(e) => setSubcategory(e.target.value)}
              placeholder="e.g., Product Manual"
            />
          </div>

          {/* Knowledge Bases */}
          {knowledgeBases.length > 0 && (
            <div className="space-y-2">
              <Label>Knowledge Bases</Label>
              <div className="grid grid-cols-2 gap-2 max-h-[120px] overflow-y-auto rounded-lg border p-2">
                {knowledgeBases.map((kb) => {
                  const isSelected = selectedKBIds.includes(kb.id)
                  return (
                    <button
                      key={kb.id}
                      type="button"
                      onClick={() => toggleKB(kb.id)}
                      className={cn(
                        "flex items-center gap-2 p-2 rounded-md text-sm transition-colors text-left",
                        isSelected
                          ? "bg-primary/10 border border-primary"
                          : "border border-transparent hover:bg-muted"
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
                      <span className="truncate flex-1">{kb.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Enhanced Processing Toggle */}
          <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-chart-1" />
              <div>
                <Label htmlFor="enhanced" className="text-sm font-medium cursor-pointer">
                  Enhanced Processing
                </Label>
                <p className="text-xs text-muted-foreground">
                  Extract entities for knowledge graph
                </p>
              </div>
            </div>
            <Switch
              id="enhanced"
              checked={enableEnhanced}
              onCheckedChange={setEnableEnhanced}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          </form>
        </div>

        <DialogFooter className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            form="upload-document-form"
            type="submit"
            disabled={loading || !selectedFile || selectedCategories.length === 0}
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {loading ? "Uploading..." : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
