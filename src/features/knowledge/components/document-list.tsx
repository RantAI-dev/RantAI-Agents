"use client"

import { DocumentCard } from "./document-card"
import { DocumentRow } from "./document-row"
import { Button } from "@/components/ui/button"
import { FileText, Plus, FilterX } from "@/lib/icons"

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
  fileType?: string
  artifactType?: string | null
  chunkCount: number
  groups: DocumentGroup[]
  createdAt: string
  updatedAt: string
  fileSize?: number
  thumbnailUrl?: string
}

interface Category {
  id: string
  name: string
  label: string
  color: string
  isSystem: boolean
}

export type ViewMode = "grid" | "list"

interface DocumentListProps {
  documents: Document[]
  loading: boolean
  onDelete: (id: string) => void
  onView: (id: string) => void
  onEdit: (id: string) => void
  categoryMap: Map<string, Category>
  onAddDocument?: () => void
  onClearFilters?: () => void
  viewMode?: ViewMode
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
  viewMode = "grid",
}: DocumentListProps) {
  if (loading) {
    if (viewMode === "list") {
      return (
        <div className="rounded-lg border overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-muted/30">
            <div className="h-3 w-8 rounded bg-muted animate-pulse" />
            <div className="flex-1" />
            <div className="h-3 w-16 rounded bg-muted animate-pulse hidden sm:block" />
            <div className="h-3 w-12 rounded bg-muted animate-pulse hidden sm:block" />
            <div className="w-7" />
          </div>
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0"
              aria-hidden
            >
              <div className="h-7 w-7 rounded-lg bg-muted animate-pulse shrink-0" />
              <div className="h-4 rounded bg-muted animate-pulse flex-1 max-w-[300px]" />
              <div className="h-4 w-16 rounded bg-muted animate-pulse hidden sm:block" />
              <div className="h-4 w-12 rounded bg-muted animate-pulse hidden sm:block" />
              <div className="w-7" />
            </div>
          ))}
        </div>
      )
    }

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
            : "Add documents to get started."}
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

  if (viewMode === "list") {
    return (
      <div className="rounded-lg border overflow-hidden">
        {/* Table header */}
        <div className="flex items-center gap-3 px-4 py-2 border-b bg-muted/30 text-xs font-medium text-muted-foreground">
          <div className="w-7 shrink-0" />
          <div className="flex-1">File</div>
          <div className="w-[100px] text-right hidden sm:block">Created At</div>
          <div className="w-[70px] text-right hidden sm:block">Size</div>
          <div className="w-7 shrink-0" />
        </div>
        {documents.map((doc) => (
          <DocumentRow
            key={doc.id}
            document={doc}
            onDelete={onDelete}
            onView={onView}
            onEdit={onEdit}
            categoryMap={categoryMap}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 [&>div]:mb-4 [&>div]:break-inside-avoid">
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
