"use client"

import { DocumentCard } from "./document-card"
import { FileText } from "lucide-react"

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
}

export function DocumentList({ documents, loading, onDelete, onView, onEdit, categoryMap }: DocumentListProps) {
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="h-40 bg-muted rounded-lg animate-pulse"
          />
        ))}
      </div>
    )
  }

  if (documents.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-1">No documents found</h3>
        <p className="text-sm text-muted-foreground">
          Add documents to your knowledge base to enhance AI responses.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {documents.map((doc) => (
        <DocumentCard key={doc.id} document={doc} onDelete={onDelete} onView={onView} onEdit={onEdit} categoryMap={categoryMap} />
      ))}
    </div>
  )
}
