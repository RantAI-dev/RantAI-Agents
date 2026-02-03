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
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, Upload, FileText, File, Folder, Check, Image, FileType } from "lucide-react"
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
}

const CATEGORIES = [
  { value: "LIFE_INSURANCE", label: "Life Insurance" },
  { value: "HEALTH_INSURANCE", label: "Health Insurance" },
  { value: "HOME_INSURANCE", label: "Home Insurance" },
  { value: "FAQ", label: "FAQ" },
  { value: "POLICY", label: "Policy" },
  { value: "GENERAL", label: "General" },
]

// Get icon component based on file extension
function getFileIcon(fileName: string) {
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."))

  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic"].includes(ext)) {
    return { Icon: Image, color: "text-green-500" }
  }
  if (ext === ".pdf") {
    return { Icon: FileType, color: "text-red-500" }
  }
  // Markdown and text files
  return { Icon: FileText, color: "text-blue-500" }
}

export function UploadDialog({ open, onOpenChange, onSuccess, knowledgeBases = [], defaultKBIds = [] }: UploadDialogProps) {
  const [loading, setLoading] = useState(false)
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [categories, setCategories] = useState<string[]>([])
  const [subcategory, setSubcategory] = useState("")
  const [selectedKBIds, setSelectedKBIds] = useState<string[]>([])
  const [error, setError] = useState("")
  const [uploadMode, setUploadMode] = useState<"text" | "file">("text")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedKBIds(defaultKBIds)
    }
  }, [open, defaultKBIds])

  const resetForm = () => {
    setTitle("")
    setContent("")
    setCategories([])
    setSubcategory("")
    setSelectedKBIds(defaultKBIds)
    setSelectedFile(null)
    setError("")
  }

  const toggleCategory = (category: string) => {
    setCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    )
  }

  const toggleKB = (kbId: string) => {
    setSelectedKBIds((prev) =>
      prev.includes(kbId)
        ? prev.filter((id) => id !== kbId)
        : [...prev, kbId]
    )
  }

  const handleFileSelect = (file: File) => {
    const validTypes = [
      "text/markdown",
      "application/pdf",
      "text/plain",
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp",
      "image/heic",
    ]
    const validExtensions = [".md", ".pdf", ".txt", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic"]
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."))

    if (!validExtensions.includes(ext) && !validTypes.includes(file.type)) {
      setError("Please upload a supported file (Markdown, PDF, or Image)")
      return
    }

    setSelectedFile(file)
    setError("")

    // Auto-fill title from filename
    if (!title) {
      const name = file.name.replace(/\.[^/.]+$/, "") // Remove extension
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

    if (categories.length === 0) {
      setError("At least one category is required")
      return
    }

    if (uploadMode === "text" && (!title || !content)) {
      setError("Title and content are required")
      return
    }

    if (uploadMode === "file" && !selectedFile) {
      setError("Please select a file")
      return
    }

    setLoading(true)
    try {
      let requestBody: FormData | string
      let headers: HeadersInit = {}

      if (uploadMode === "file" && selectedFile) {
        // Use FormData for file upload
        const formData = new FormData()
        formData.append("file", selectedFile)
        formData.append("title", title || selectedFile.name.replace(/\.[^/.]+$/, ""))
        formData.append("categories", JSON.stringify(categories))
        if (subcategory) formData.append("subcategory", subcategory)
        if (selectedKBIds.length > 0) formData.append("groupIds", JSON.stringify(selectedKBIds))
        requestBody = formData
      } else {
        // Use JSON for text content
        headers = { "Content-Type": "application/json" }
        requestBody = JSON.stringify({
          title,
          content,
          categories,
          subcategory: subcategory || undefined,
          groupIds: selectedKBIds.length > 0 ? selectedKBIds : undefined,
        })
      }

      const response = await fetch("/api/dashboard/knowledge", {
        method: "POST",
        headers,
        body: requestBody,
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to create document")
      }

      resetForm()
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create document")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(open) => { if (!open) resetForm(); onOpenChange(open); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Document</DialogTitle>
          <DialogDescription>
            Add a new document to the knowledge base. Upload a file or paste content directly.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Tabs value={uploadMode} onValueChange={(v) => setUploadMode(v as "text" | "file")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="text" className="gap-2">
                <FileText className="h-4 w-4" />
                Write Markdown
              </TabsTrigger>
              <TabsTrigger value="file" className="gap-2">
                <Upload className="h-4 w-4" />
                Upload File
              </TabsTrigger>
            </TabsList>

            <TabsContent value="text" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Document title"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="content">Content (Markdown)</Label>
                <Textarea
                  id="content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Enter the document content in Markdown format..."
                  className="min-h-[300px] font-mono text-sm"
                />
              </div>
            </TabsContent>

            <TabsContent value="file" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="file-title">Title</Label>
                <Input
                  id="file-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Document title (auto-filled from filename)"
                />
              </div>

              <div
                className={cn(
                  "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
                  dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25",
                  selectedFile ? "bg-muted/50" : ""
                )}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".md,.pdf,.txt,.png,.jpg,.jpeg,.gif,.webp,.heic,text/markdown,application/pdf,text/plain,image/*"
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
                      return (
                        <div className="flex items-center justify-center gap-2">
                          <Icon className={cn("h-8 w-8", color)} />
                        </div>
                      )
                    })()}
                    <p className="font-medium">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedFile(null)}
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                    <p className="text-muted-foreground">
                      Drag and drop a file here, or{" "}
                      <button
                        type="button"
                        className="text-primary hover:underline"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        browse
                      </button>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Supports: Markdown (.md), PDF (.pdf), Images (.png, .jpg, .webp, .heic)
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>

          {/* Categories (multi-select) */}
          <div className="space-y-2">
            <Label>Categories (select one or more)</Label>
            <div className="flex gap-2 flex-wrap">
              {CATEGORIES.map((cat) => (
                <Badge
                  key={cat.value}
                  variant={categories.includes(cat.value) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => toggleCategory(cat.value)}
                >
                  {cat.label}
                </Badge>
              ))}
            </div>
          </div>

          {/* Subcategory */}
          <div className="space-y-2">
            <Label htmlFor="subcategory">Subcategory (optional)</Label>
            <Input
              id="subcategory"
              value={subcategory}
              onChange={(e) => setSubcategory(e.target.value)}
              placeholder="e.g., Term Life Premium"
            />
          </div>

          {/* Knowledge Bases (multi-select) */}
          {knowledgeBases.length > 0 && (
            <div className="space-y-2">
              <Label>Knowledge Bases</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Select which knowledge bases this document belongs to.
              </p>
              <div className="grid grid-cols-2 gap-2 max-h-[150px] overflow-y-auto rounded-lg border p-2">
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
                        style={{ backgroundColor: kb.color || "#3b82f6" }}
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
              {selectedKBIds.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {selectedKBIds.length} knowledge base{selectedKBIds.length !== 1 ? "s" : ""} selected
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || categories.length === 0}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {loading ? "Creating..." : "Create Document"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
