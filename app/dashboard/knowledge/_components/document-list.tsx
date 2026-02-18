"use client"

import { DocumentCard } from "./document-card"
import { Button } from "@/components/ui/button"
import { FileText, Plus, FilterX } from "lucide-react"

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
  artifactType?: string | null
  chunkCount: number
  groups: DocumentGroup[]
  createdAt: string
  updatedAt: string
}

interface Category {
  id: string
  name: string
  label: string
  color: string
  isSystem: boolean
}

interface DocumentListProps {
  documents: Document[]
  loading: boolean
  onDelete: (id: string) => void
  onView: (id: string) => void
  onEdit: (id: string) => void
  categoryMap: Map<string, Category>
  onAddDocument?: () => void
  onClearFilters?: () => void
}

export function DocumentList({
  documents,
  loading,
  onDelete,
  onView,
  onEdit,
  categoryMap,
  onAddDocument,
  onClearFilters,
}: DocumentListProps) {
  if (loading) {
    return (
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="h-44 rounded-xl border bg-muted/40 animate-pulse"
            aria-hidden
          />
        ))}
      </div>
    )
  }

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-muted/60 mb-4">
          <FileText className="h-8 w-8 text-muted-foreground" aria-hidden />
        </div>
        <h3 className="text-lg font-semibold mb-1">No documents found</h3>
        <p className="text-sm text-muted-foreground max-w-sm mb-6">
          {onClearFilters
            ? "Try clearing filters or add a document to get started."
            : "Add documents to your knowledge base to enhance AI responses."}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2" role="group" aria-label="Empty state actions">
          {onAddDocument && (
            <Button onClick={onAddDocument} aria-label="Add document">
              <Plus className="h-4 w-4 mr-2" />
              Add document
            </Button>
          )}
          {onClearFilters && (
            <Button variant="outline" onClick={onClearFilters} aria-label="Clear filters">
              <FilterX className="h-4 w-4 mr-2" />
              Clear filters
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 stagger-grid">
      {documents.map((doc) => (
        <div key={doc.id} className="animate-fade-in-up">
          <DocumentCard
            document={doc}
            onDelete={onDelete}
            onView={onView}
            onEdit={onEdit}
            categoryMap={categoryMap}
          />
        </div>
      ))}
    </div>
  )
}
