"use client"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { MoreVertical, Trash2, Eye, Pencil } from "lucide-react"
import { useState } from "react"
import { getFileTypeIcon, formatFileSize } from "./file-type-utils"

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

interface DocumentCardProps {
  document: Document
  onDelete: (id: string) => void
  onView: (id: string) => void
  onEdit: (id: string) => void
  categoryMap: Map<string, Category>
}

export function DocumentCard({ document, onDelete, onView, onEdit }: DocumentCardProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [imgError, setImgError] = useState(false)
  const { Icon: FileIcon, iconColor, bgColor } = getFileTypeIcon(document.fileType, document.artifactType)

  const handleDelete = () => {
    onDelete(document.id)
    setDeleteDialogOpen(false)
  }

  const hasThumbnail = document.thumbnailUrl && !imgError

  return (
    <>
      <div
        className="group relative cursor-pointer rounded-lg border bg-card overflow-hidden transition-all duration-200 hover:shadow-lg hover:shadow-primary/5 hover:border-primary/30 hover:-translate-y-0.5"
        onClick={() => onView(document.id)}
      >
        {/* Actions dropdown - top right, appears on hover */}
        <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                className="h-7 w-7 shadow-sm"
                onClick={(e) => e.stopPropagation()}
                aria-label="Document actions"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onView(document.id) }}>
                <Eye className="h-4 w-4 mr-2" />
                View
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(document.id) }}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); setDeleteDialogOpen(true) }}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Preview area */}
        {hasThumbnail ? (
          /* Image thumbnail - fills card width, aspect ratio preserved */
          <div className="relative bg-muted/30">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={document.thumbnailUrl}
              alt={document.title}
              className="w-full h-auto block"
              onError={() => setImgError(true)}
              loading="lazy"
            />
          </div>
        ) : (
          /* Icon placeholder for non-image files */
          <div className="flex items-center justify-center py-8 bg-muted/20">
            <div
              className={`rounded-2xl p-4 ${bgColor}`}
              aria-hidden
            >
              <FileIcon className={`h-10 w-10 ${iconColor}`} />
            </div>
          </div>
        )}

        {/* Footer: title + file size */}
        <div className="px-3 py-2.5 border-t border-border/50">
          <p className="text-sm font-medium leading-snug line-clamp-2 text-center">
            {document.title}
          </p>
          {document.fileSize != null && document.fileSize > 0 && (
            <p className="text-xs text-muted-foreground text-center mt-1">
              {formatFileSize(document.fileSize)}
            </p>
          )}
        </div>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{document.title}&quot;? This
              will also remove all {document.chunkCount} chunks from the
              knowledge base.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
