"use client"

import { useState, useEffect } from "react"
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
import { Loader2, Check, Folder, Plus } from "lucide-react"
import { CategoryDialog, Category } from "./category-dialog"
import { cn } from "@/lib/utils"

interface KnowledgeBase {
  id: string
  name: string
  color: string | null
  documentCount: number
}

interface DocumentGroup {
  id: string
  name: string
  color: string | null
}

interface DocumentData {
  id: string
  title: string
  categories: string[]
  subcategory: string | null
  groups: DocumentGroup[]
}

interface DocumentEditDialogProps {
  documentId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  knowledgeBases: KnowledgeBase[]
  categories: Category[]
  onCategoriesChange: () => void
}

export function DocumentEditDialog({
  documentId,
  open,
  onOpenChange,
  onSuccess,
  knowledgeBases,
  categories: availableCategories,
  onCategoriesChange,
}: DocumentEditDialogProps) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [document, setDocument] = useState<DocumentData | null>(null)
  const [title, setTitle] = useState("")
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [subcategory, setSubcategory] = useState("")
  const [selectedKBIds, setSelectedKBIds] = useState<string[]>([])
  const [error, setError] = useState("")
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)

  // Fetch document data when dialog opens
  useEffect(() => {
    if (open && documentId) {
      setLoading(true)
      setError("")
      fetch(`/api/dashboard/knowledge/${documentId}`)
        .then((res) => res.json())
        .then((data) => {
          setDocument(data)
          setTitle(data.title)
          setSelectedCategories(data.categories || [])
          setSubcategory(data.subcategory || "")
          setSelectedKBIds(data.groups?.map((g: DocumentGroup) => g.id) || [])
        })
        .catch((err) => {
          console.error("Failed to fetch document:", err)
          setError("Failed to load document")
        })
        .finally(() => setLoading(false))
    }
  }, [open, documentId])

  const toggleCategory = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    )
  }

  const handleCategoryCreated = () => {
    setCategoryDialogOpen(false)
    onCategoriesChange()
  }

  const toggleKB = (kbId: string) => {
    setSelectedKBIds((prev) =>
      prev.includes(kbId)
        ? prev.filter((id) => id !== kbId)
        : [...prev, kbId]
    )
  }

  const handleSave = async () => {
    if (!documentId || selectedCategories.length === 0) {
      setError("At least one category is required")
      return
    }

    setSaving(true)
    setError("")

    try {
      const response = await fetch(`/api/dashboard/knowledge/${documentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          categories: selectedCategories,
          subcategory: subcategory || null,
          groupIds: selectedKBIds,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to update document")
      }

      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update document")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Document</DialogTitle>
          <DialogDescription>
            Update the document's title, categories, and knowledge base assignments.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : document ? (
          <div className="space-y-4 py-4">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Document title"
              />
            </div>

            {/* Categories */}
            <div className="space-y-2">
              <Label>Categories (select one or more)</Label>
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

            {/* Category Dialog */}
            <CategoryDialog
              open={categoryDialogOpen}
              onOpenChange={setCategoryDialogOpen}
              onSuccess={handleCategoryCreated}
            />

            {/* Subcategory */}
            <div className="space-y-2">
              <Label htmlFor="edit-subcategory">Subcategory (optional)</Label>
              <Input
                id="edit-subcategory"
                value={subcategory}
                onChange={(e) => setSubcategory(e.target.value)}
                placeholder="e.g., Term Life Premium"
              />
            </div>

            {/* Knowledge Bases */}
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
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            {error || "No document selected"}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading || saving || selectedCategories.length === 0}
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
