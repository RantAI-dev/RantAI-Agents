"use client"

import { Badge } from "@/components/ui/badge"
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
import { MoreVertical, Trash2, Eye, Pencil, CircleDot, RefreshCw, Loader2 } from "@/lib/icons"
import { formatDistanceToNow, format } from "date-fns"
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

interface DocumentRowProps {
  document: Document
  onDelete: (id: string) => void
  onView: (id: string) => void
  onEdit: (id: string) => void
  categoryMap: Map<string, Category>
}

export function DocumentRow({ document, onDelete, onView, onEdit, categoryMap }: DocumentRowProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const { Icon: FileIcon, iconColor, bgColor } = getFileTypeIcon(document.fileType, document.artifactType)

  const handleDelete = () => {
    onDelete(document.id)
    setDeleteDialogOpen(false)
  }

  const createdDate = new Date(document.createdAt)
  const isRecent = Date.now() - createdDate.getTime() < 7 * 24 * 60 * 60 * 1000 // 7 days
  const dateDisplay = isRecent
    ? formatDistanceToNow(createdDate, { addSuffix: true })
    : format(createdDate, "yyyy-MM-dd")

  return (
    <>
      <div
        className="group flex items-center gap-3 px-4 py-3 border-b last:border-b-0 hover:bg-muted/50 cursor-pointer transition-colors"
        onClick={() => onView(document.id)}
      >
        {/* File icon */}
        <div
          className={`rounded-lg p-1.5 shrink-0 ${bgColor}`}
          aria-hidden
        >
          <FileIcon className={`h-4 w-4 ${iconColor}`} />
        </div>

        {/* Title */}
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="text-sm font-medium truncate">
            {document.title}
          </span>
          {/* Status badge inline with title */}
          {document.chunkCount === 0 && document.artifactType ? (
            <Badge
              variant="outline"
              className="text-[10px] h-5 px-1.5 shrink-0 gap-1 text-muted-foreground"
            >
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              Indexing
            </Badge>
          ) : document.chunkCount === 0 ? (
            <Badge
              variant="destructive"
              className="text-[10px] h-5 px-1.5 shrink-0 gap-1"
            >
              Chunking failed
              <RefreshCw className="h-2.5 w-2.5" />
            </Badge>
          ) : document.chunkCount > 0 ? (
            <Badge
              variant="secondary"
              className="text-[10px] h-5 px-1.5 shrink-0 gap-1 font-mono"
            >
              <CircleDot className="h-2.5 w-2.5" />
              {document.chunkCount}
            </Badge>
          ) : null}
        </div>

        {/* Created date */}
        <span className="text-xs text-muted-foreground shrink-0 w-[100px] text-right hidden sm:block">
          {dateDisplay}
        </span>

        {/* File size */}
        <span className="text-xs text-muted-foreground shrink-0 w-[70px] text-right hidden sm:block tabular-nums">
          {formatFileSize(document.fileSize)}
        </span>

        {/* Actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
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
