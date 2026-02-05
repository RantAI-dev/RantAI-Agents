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
import { Loader2, Upload, FileText, Folder, Check, Image, FileType, Plus, Sparkles } from "lucide-react"
import { CategoryDialog, Category } from "./category-dialog"
import { cn } from "@/lib/utils"

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
    return { Icon: Image, color: "text-green-500" }
  }
  if (ext === ".pdf") {
    return { Icon: FileType, color: "text-red-500" }
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
    const validExtensions = [".md", ".pdf", ".txt", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic"]
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."))

    if (!validExtensions.includes(ext)) {
      setError("Please upload a supported file (Markdown, PDF, Text, or Image)")
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
              accept=".md,.pdf,.txt,.png,.jpg,.jpeg,.gif,.webp,.heic"
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
                <p className="text-xs text-muted-foreground">
                  Markdown, PDF, Text, or Images
                </p>
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
            <div className="flex gap-2 flex-wrap">
              {availableCategories.map((cat) => {
                const isSelected = selectedCategories.includes(cat.name)
                return (
                  <Badge
                    key={cat.name}
                    variant={isSelected ? "default" : "outline"}
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer"
                    style={
                      isSelected
                        ? { backgroundColor: cat.color, borderColor: cat.color }
                        : { borderColor: cat.color, color: cat.color }
                    }
                    onClick={() => toggleCategory(cat.name)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        toggleCategory(cat.name)
                      }
                    }}
                  >
                    {cat.label}
                  </Badge>
                )
              })}
              <Badge
                variant="outline"
                role="button"
                tabIndex={0}
                className="cursor-pointer border-dashed"
                onClick={() => setCategoryDialogOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    setCategoryDialogOpen(true)
                  }
                }}
              >
                <Plus className="h-3 w-3 mr-1" />
                New
              </Badge>
            </div>
          </div>

          <CategoryDialog
            open={categoryDialogOpen}
            onOpenChange={setCategoryDialogOpen}
            onSuccess={handleCategoryCreated}
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
