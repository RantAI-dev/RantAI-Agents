"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { SlidersHorizontal } from "@/lib/icons"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DocumentList, type ViewMode } from "@/features/knowledge/components/document-list"
import { UploadDialog } from "@/features/knowledge/components/upload-dialog"
import { DocumentEditDialog } from "@/features/knowledge/components/document-edit-dialog"
import { CategoryDialog, Category } from "@/features/knowledge/components/category-dialog"
import { KnowledgeHeader } from "@/features/knowledge/components/knowledge-header"
import { KnowledgeToolbar, type SortOption } from "@/features/knowledge/components/knowledge-toolbar"
import { FiltersPanel } from "@/features/knowledge/components/filters-panel"
import { cn } from "@/lib/utils"

export interface DocumentGroup {
  id: string
  name: string
  color: string | null
}

export interface Document {
  id: string
  title: string
  categories: string[]
  subcategory: string | null
  fileType?: string
  artifactType?: string | null
  chunkCount: number
  groups: DocumentGroup[]
  createdAt: string
  updatedAt: string
  fileSize?: number
  thumbnailUrl?: string
}

export interface KnowledgeBase {
  id: string
  name: string
  description: string | null
  color: string | null
  documentCount: number
  createdAt: string
  updatedAt: string
}

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
]

export default function KnowledgePageClient({
  initialDocuments,
  initialKnowledgeBases,
  initialCategories,
  initialSelectedKBId,
  initialAction,
}: {
  initialDocuments: Document[]
  initialKnowledgeBases: KnowledgeBase[]
  initialCategories: Category[]
  initialSelectedKBId: string | null
  initialAction: string | null
}) {
  const router = useRouter()

  const [documents, setDocuments] = useState<Document[]>(initialDocuments)
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>(initialKnowledgeBases)
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [editingDocumentId, setEditingDocumentId] = useState<string | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [sortOption, setSortOption] = useState<SortOption>("newest")
  const [viewMode, setViewMode] = useState<ViewMode>("grid")
  const [contentTab, setContentTab] = useState<"documents" | "artifacts">("documents")

  // Categories state
  const [categories, setCategories] = useState<Category[]>(initialCategories)
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)

  // Knowledge Base CRUD dialog state
  const [kbDialogOpen, setKbDialogOpen] = useState(false)
  const [editingKB, setEditingKB] = useState<KnowledgeBase | null>(null)
  const [kbName, setKbName] = useState("")
  const [kbDescription, setKbDescription] = useState("")
  const [kbColor, setKbColor] = useState(PRESET_COLORS[0])
  const [savingKB, setSavingKB] = useState(false)
  const [deleteKBDialogOpen, setDeleteKBDialogOpen] = useState(false)

  // Get selected KB info
  const selectedKB = knowledgeBases.find((kb) => kb.id === initialSelectedKBId)

  useEffect(() => {
    setDocuments(initialDocuments)
  }, [initialDocuments])

  useEffect(() => {
    setKnowledgeBases(initialKnowledgeBases)
  }, [initialKnowledgeBases])

  useEffect(() => {
    setCategories(initialCategories)
  }, [initialCategories])

  const fetchDocuments = useCallback(async (groupId?: string | null) => {
    try {
      setLoading(true)
      const url = groupId
        ? `/api/dashboard/files?groupId=${groupId}`
        : "/api/dashboard/files"
      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json()
        setDocuments(data.documents)
      }
    } catch (error) {
      console.error("Failed to fetch documents:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchKnowledgeBases = useCallback(async () => {
    try {
      const response = await fetch("/api/dashboard/files/groups")
      if (response.ok) {
        const data = await response.json()
        setKnowledgeBases(data.groups)
      }
    } catch (error) {
      console.error("Failed to fetch knowledge bases:", error)
    }
  }, [])

  const fetchCategories = useCallback(async () => {
    try {
      const response = await fetch("/api/dashboard/files/categories")
      if (response.ok) {
        const data = await response.json()
        setCategories(data.categories)
      }
    } catch (error) {
      console.error("Failed to fetch categories:", error)
    }
  }, [])

  // Handle action=new-kb from URL
  useEffect(() => {
    if (initialAction === "new-kb") {
      handleCreateKB()
      // Clear the action from URL
      router.replace("/dashboard/files")
    }
  }, [initialAction, router])

  const handleUploadSuccess = () => {
    setUploadDialogOpen(false)
    fetchDocuments(initialSelectedKBId)
    fetchKnowledgeBases()
    // Trigger sidebar refresh by dispatching a custom event
    window.dispatchEvent(new CustomEvent("knowledge-bases-updated"))
  }

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/dashboard/files/${id}`, {
        method: "DELETE",
      })
      if (response.ok) {
        setDocuments((prev) => prev.filter((doc) => doc.id !== id))
        fetchKnowledgeBases()
        window.dispatchEvent(new CustomEvent("knowledge-bases-updated"))
      }
    } catch (error) {
      console.error("Failed to delete document:", error)
    }
  }

  const handleView = (id: string) => {
    router.push(`/dashboard/files/${id}`)
  }

  const handleEdit = (id: string) => {
    setEditingDocumentId(id)
    setEditDialogOpen(true)
  }

  const handleEditSuccess = () => {
    setEditDialogOpen(false)
    setEditingDocumentId(null)
    fetchDocuments(initialSelectedKBId)
    fetchKnowledgeBases()
    window.dispatchEvent(new CustomEvent("knowledge-bases-updated"))
  }

  // Toggle category filter
  const toggleCategory = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    )
  }

  // Count artifacts for tab visibility
  const artifactCount = documents.filter((doc) => doc.artifactType != null).length

  // Filter documents
  const filteredDocuments = documents.filter((doc) => {
    // Tab filter: documents vs artifacts
    const matchesTab = contentTab === "documents"
      ? doc.artifactType == null
      : doc.artifactType != null
    const matchesSearch =
      doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.categories.some((c) => c.toLowerCase().includes(searchQuery.toLowerCase()))
    const matchesCategory =
      selectedCategories.length === 0 ||
      doc.categories.some((c) => selectedCategories.includes(c))
    return matchesTab && matchesSearch && matchesCategory
  })

  // Sort filtered documents
  const sortedDocuments = [...filteredDocuments].sort((a, b) => {
    if (sortOption === "newest") {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    }
    if (sortOption === "oldest") {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    }
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
  })

  const hasActiveFilters = selectedCategories.length > 0 || searchQuery.trim().length > 0
  const clearAllFilters = () => {
    setSelectedCategories([])
    setSearchQuery("")
  }

  // Knowledge Base CRUD handlers
  const handleCreateKB = () => {
    setEditingKB(null)
    setKbName("")
    setKbDescription("")
    setKbColor(PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)])
    setKbDialogOpen(true)
  }

  const handleEditKB = () => {
    if (selectedKB) {
      setEditingKB(selectedKB)
      setKbName(selectedKB.name)
      setKbDescription(selectedKB.description || "")
      setKbColor(selectedKB.color || PRESET_COLORS[0])
      setKbDialogOpen(true)
    }
  }

  const handleDeleteKB = async () => {
    if (!selectedKB) return

    try {
      const response = await fetch(`/api/dashboard/files/groups/${selectedKB.id}`, {
        method: "DELETE",
      })
      if (response.ok) {
        router.push("/dashboard/files")
        fetchKnowledgeBases()
        window.dispatchEvent(new CustomEvent("knowledge-bases-updated"))
      }
    } catch (error) {
      console.error("Failed to delete knowledge base:", error)
    } finally {
      setDeleteKBDialogOpen(false)
    }
  }

  const handleSaveKB = async () => {
    if (!kbName.trim()) return

    setSavingKB(true)
    try {
      const url = editingKB
        ? `/api/dashboard/files/groups/${editingKB.id}`
        : "/api/dashboard/files/groups"

      const response = await fetch(url, {
        method: editingKB ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: kbName.trim(),
          description: kbDescription.trim() || null,
          color: kbColor,
        }),
      })

      if (response.ok) {
        setKbDialogOpen(false)
        fetchKnowledgeBases()
        window.dispatchEvent(new CustomEvent("knowledge-bases-updated"))
      }
    } catch (error) {
      console.error("Failed to save knowledge base:", error)
    } finally {
      setSavingKB(false)
    }
  }

  // Category dialog handlers
  const handleCreateCategory = () => {
    setEditingCategory(null)
    setCategoryDialogOpen(true)
  }

  const handleCategorySuccess = () => {
    setCategoryDialogOpen(false)
    setEditingCategory(null)
    fetchCategories()
  }

  // Create category map for quick lookup
  const categoryMap = new Map(categories.map((cat) => [cat.name, cat]))

  return (
    <div className="flex flex-col h-full">
      <KnowledgeHeader
        selectedKB={selectedKB ?? null}
        documentCount={documents.length}
        knowledgeBaseCount={knowledgeBases.length}
        onAddDocument={contentTab === "documents" ? () => setUploadDialogOpen(true) : undefined}
        onEditKB={selectedKB ? handleEditKB : undefined}
        onDeleteKB={selectedKB ? () => setDeleteKBDialogOpen(true) : undefined}
      />

      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Content tabs: Documents vs Artifacts */}
        {artifactCount > 0 && (
          <div className="flex border-b border-border/50 px-4">
            <button
              type="button"
              className={cn(
                "px-3 py-2.5 text-sm font-medium border-b-2 transition-colors",
                contentTab === "documents"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setContentTab("documents")}
            >
              Documents
              <span className="ml-1.5 text-xs text-muted-foreground">
                {documents.filter((d) => d.artifactType == null).length}
              </span>
            </button>
            <button
              type="button"
              className={cn(
                "px-3 py-2.5 text-sm font-medium border-b-2 transition-colors",
                contentTab === "artifacts"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setContentTab("artifacts")}
            >
              Artifacts
              <span className="ml-1.5 text-xs text-muted-foreground">
                {artifactCount}
              </span>
            </button>
          </div>
        )}

        <KnowledgeToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={clearAllFilters}
          sortOption={sortOption}
          onSortChange={setSortOption}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          filtersPopover={
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" aria-label="Open filters">
                  <SlidersHorizontal className="h-4 w-4 mr-2" />
                  Filter
                  {selectedCategories.length > 0 && (
                    <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-[10px] font-medium text-background">
                      {selectedCategories.length}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="p-0" aria-label="Filter by category">
                <FiltersPanel
                  categories={categories}
                  selectedCategories={selectedCategories}
                  onToggleCategory={toggleCategory}
                  onNewCategory={handleCreateCategory}
                  onClearFilters={() => setSelectedCategories([])}
                />
              </PopoverContent>
            </Popover>
          }
        />

        <div className="flex-1 overflow-auto p-6" role="region" aria-label="Documents">
          <DocumentList
            documents={sortedDocuments}
            loading={loading}
            onDelete={handleDelete}
            onView={handleView}
            onEdit={handleEdit}
            categoryMap={categoryMap}
            onAddDocument={() => setUploadDialogOpen(true)}
            onClearFilters={hasActiveFilters ? clearAllFilters : undefined}
            viewMode={viewMode}
          />
        </div>
      </div>

      {/* Upload Dialog */}
      <UploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        onSuccess={handleUploadSuccess}
        knowledgeBases={knowledgeBases}
        defaultKBIds={initialSelectedKBId ? [initialSelectedKBId] : []}
        categories={categories}
        onCategoriesChange={fetchCategories}
      />

      {/* Document Edit Dialog */}
      <DocumentEditDialog
        documentId={editingDocumentId}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={handleEditSuccess}
        knowledgeBases={knowledgeBases}
        categories={categories}
        onCategoriesChange={fetchCategories}
      />

      {/* Category Create/Edit Dialog */}
      <CategoryDialog
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
        onSuccess={handleCategorySuccess}
        editingCategory={editingCategory}
      />

      {/* Knowledge Base Create/Edit Dialog */}
      <Dialog open={kbDialogOpen} onOpenChange={setKbDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingKB ? "Edit Knowledge Base" : "Create Knowledge Base"}
            </DialogTitle>
            <DialogDescription>
              {editingKB
                ? "Update the knowledge base details."
                : "Create a new knowledge base to organize your documents."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="kb-name">Name</Label>
              <Input
                id="kb-name"
                value={kbName}
                onChange={(e) => setKbName(e.target.value)}
                placeholder="e.g., Product Documentation"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="kb-description">Description (optional)</Label>
              <Textarea
                id="kb-description"
                value={kbDescription}
                onChange={(e) => setKbDescription(e.target.value)}
                placeholder="What documents belong here?"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2 flex-wrap">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setKbColor(c)}
                    className={cn(
                      "h-8 w-8 rounded-full transition-all",
                      kbColor === c ? "ring-2 ring-offset-2 ring-primary" : ""
                    )}
                    style={{ backgroundColor: c }}
                    aria-label={`Select color ${c}`}
                    aria-pressed={kbColor === c}
                  />
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setKbDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveKB} disabled={!kbName.trim() || savingKB}>
              {savingKB ? "Saving..." : editingKB ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete KB Confirmation */}
      <AlertDialog open={deleteKBDialogOpen} onOpenChange={setDeleteKBDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete knowledge base</AlertDialogTitle>
            <AlertDialogDescription>
              Delete &ldquo;{selectedKB?.name}&rdquo;? Documents will be unassigned but not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteKB} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
