"use client"

import { useEffect, useState, useCallback, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Plus, Search, MoreHorizontal, Pencil, Trash2, Folder, Loader2 } from "lucide-react"
import { DocumentList } from "./_components/document-list"
import { UploadDialog } from "./_components/upload-dialog"
import { DocumentViewer } from "./_components/document-viewer"
import { DocumentEditDialog } from "./_components/document-edit-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

// Wrapper page component with Suspense
export default function KnowledgePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <KnowledgePageContent />
    </Suspense>
  )
}

interface DocumentGroup {
  id: string
  name: string
  color: string | null
}

interface Document {
  id: string
  title: string
  categories: string[]
  subcategory: string | null
  fileType?: "markdown" | "pdf"
  chunkCount: number
  groups: DocumentGroup[]
  createdAt: string
  updatedAt: string
}

interface KnowledgeBase {
  id: string
  name: string
  description: string | null
  color: string | null
  documentCount: number
  createdAt: string
  updatedAt: string
}

const CATEGORIES = [
  { value: "LIFE_INSURANCE", label: "Life Insurance" },
  { value: "HEALTH_INSURANCE", label: "Health Insurance" },
  { value: "HOME_INSURANCE", label: "Home Insurance" },
  { value: "FAQ", label: "FAQ" },
  { value: "POLICY", label: "Policy" },
  { value: "GENERAL", label: "General" },
]

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
]

function KnowledgePageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  // Get KB ID and action from URL
  const selectedKBId = searchParams.get("kb")
  const action = searchParams.get("action")

  const [documents, setDocuments] = useState<Document[]>([])
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [viewingDocumentId, setViewingDocumentId] = useState<string | null>(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [editingDocumentId, setEditingDocumentId] = useState<string | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)

  // Knowledge Base CRUD dialog state
  const [kbDialogOpen, setKbDialogOpen] = useState(false)
  const [editingKB, setEditingKB] = useState<KnowledgeBase | null>(null)
  const [kbName, setKbName] = useState("")
  const [kbDescription, setKbDescription] = useState("")
  const [kbColor, setKbColor] = useState(PRESET_COLORS[0])
  const [savingKB, setSavingKB] = useState(false)

  // Get selected KB info
  const selectedKB = knowledgeBases.find((kb) => kb.id === selectedKBId)

  const fetchDocuments = useCallback(async (groupId?: string | null) => {
    try {
      const url = groupId
        ? `/api/dashboard/knowledge?groupId=${groupId}`
        : "/api/dashboard/knowledge"
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
      const response = await fetch("/api/dashboard/knowledge/groups")
      if (response.ok) {
        const data = await response.json()
        setKnowledgeBases(data.groups)
      }
    } catch (error) {
      console.error("Failed to fetch knowledge bases:", error)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    fetchDocuments(selectedKBId)
    fetchKnowledgeBases()
  }, [fetchDocuments, fetchKnowledgeBases, selectedKBId])

  // Handle action=new-kb from URL
  useEffect(() => {
    if (action === "new-kb") {
      handleCreateKB()
      // Clear the action from URL
      router.replace("/dashboard/knowledge")
    }
  }, [action, router])

  const handleUploadSuccess = () => {
    setUploadDialogOpen(false)
    fetchDocuments(selectedKBId)
    fetchKnowledgeBases()
    // Trigger sidebar refresh by dispatching a custom event
    window.dispatchEvent(new CustomEvent("knowledge-bases-updated"))
  }

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/dashboard/knowledge/${id}`, {
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
    setViewingDocumentId(id)
    setViewerOpen(true)
  }

  const handleEdit = (id: string) => {
    setEditingDocumentId(id)
    setEditDialogOpen(true)
  }

  const handleEditSuccess = () => {
    setEditDialogOpen(false)
    setEditingDocumentId(null)
    fetchDocuments(selectedKBId)
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

  // Filter documents
  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch =
      doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.categories.some((c) => c.toLowerCase().includes(searchQuery.toLowerCase()))
    const matchesCategory =
      selectedCategories.length === 0 ||
      doc.categories.some((c) => selectedCategories.includes(c))
    return matchesSearch && matchesCategory
  })

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
    if (!confirm(`Delete "${selectedKB.name}"? Documents will be unassigned but not deleted.`)) {
      return
    }

    try {
      const response = await fetch(`/api/dashboard/knowledge/groups/${selectedKB.id}`, {
        method: "DELETE",
      })
      if (response.ok) {
        router.push("/dashboard/knowledge")
        fetchKnowledgeBases()
        window.dispatchEvent(new CustomEvent("knowledge-bases-updated"))
      }
    } catch (error) {
      console.error("Failed to delete knowledge base:", error)
    }
  }

  const handleSaveKB = async () => {
    if (!kbName.trim()) return

    setSavingKB(true)
    try {
      const url = editingKB
        ? `/api/dashboard/knowledge/groups/${editingKB.id}`
        : "/api/dashboard/knowledge/groups"

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

  // Count documents per category (in current view)
  const categoryCounts = CATEGORIES.reduce((acc, cat) => {
    acc[cat.value] = documents.filter((d) => d.categories.includes(cat.value)).length
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b pl-14 pr-4 bg-background">
        <div className="flex items-center gap-3">
          {selectedKB ? (
            <>
              <div
                className="h-6 w-6 rounded flex items-center justify-center shrink-0"
                style={{ backgroundColor: selectedKB.color || "#3b82f6" }}
              >
                <Folder className="h-4 w-4 text-white" />
              </div>
              <h1 className="text-lg font-semibold">{selectedKB.name}</h1>
              <span className="text-sm text-muted-foreground">
                {documents.length} document{documents.length !== 1 ? "s" : ""}
              </span>
            </>
          ) : (
            <h1 className="text-lg font-semibold">All Documents</h1>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {selectedKB && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleEditKB}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit Knowledge Base
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleDeleteKB}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Knowledge Base
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button onClick={() => setUploadDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Document
          </Button>
        </div>
      </header>

      {/* Content */}
      <div className="flex flex-col h-full overflow-hidden">
        {/* Category Filters & Search */}
        <div className="border-b p-4">
          <div className="flex gap-2 flex-wrap mb-3">
            {CATEGORIES.map((cat) => (
              <Badge
                key={cat.value}
                variant={selectedCategories.includes(cat.value) ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => toggleCategory(cat.value)}
              >
                {cat.label} ({categoryCounts[cat.value] || 0})
              </Badge>
            ))}
            {selectedCategories.length > 0 && (
              <Badge
                variant="secondary"
                className="cursor-pointer"
                onClick={() => setSelectedCategories([])}
              >
                Clear filters
              </Badge>
            )}
          </div>
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Document List */}
        <div className="flex-1 overflow-auto p-4">
          <DocumentList
            documents={filteredDocuments}
            loading={loading}
            onDelete={handleDelete}
            onView={handleView}
            onEdit={handleEdit}
          />
        </div>
      </div>

      {/* Upload Dialog */}
      <UploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        onSuccess={handleUploadSuccess}
        knowledgeBases={knowledgeBases}
        defaultKBIds={selectedKBId ? [selectedKBId] : []}
      />

      {/* Document Viewer */}
      <DocumentViewer
        documentId={viewingDocumentId}
        open={viewerOpen}
        onOpenChange={setViewerOpen}
      />

      {/* Document Edit Dialog */}
      <DocumentEditDialog
        documentId={editingDocumentId}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={handleEditSuccess}
        knowledgeBases={knowledgeBases}
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
    </div>
  )
}
