"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { MoreVertical, Trash2, FileText, Layers, Eye, Folder, Pencil, Image, FileType } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { useState } from "react"

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
  fileType?: "markdown" | "pdf" | "image"
  chunkCount: number
  groups: DocumentGroup[]
  createdAt: string
  updatedAt: string
}

// Get icon and color based on file type
function getFileTypeIcon(fileType?: string) {
  switch (fileType) {
    case "image":
      return { Icon: Image, bgColor: "bg-green-100 dark:bg-green-900/30", iconColor: "text-green-600 dark:text-green-400" }
    case "pdf":
      return { Icon: FileType, bgColor: "bg-red-100 dark:bg-red-900/30", iconColor: "text-red-600 dark:text-red-400" }
    default:
      return { Icon: FileText, bgColor: "bg-blue-100 dark:bg-blue-900/30", iconColor: "text-blue-600 dark:text-blue-400" }
  }
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

// Helper to get category display info with fallback for unknown categories
function getCategoryDisplay(categoryName: string, categoryMap: Map<string, Category>) {
  const category = categoryMap.get(categoryName)
  if (category) {
    return { label: category.label, color: category.color }
  }
  // Fallback for unknown categories
  return {
    label: categoryName.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
    color: "#6b7280", // gray
  }
}

export function DocumentCard({ document, onDelete, onView, onEdit, categoryMap }: DocumentCardProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const { Icon: FileIcon, bgColor, iconColor } = getFileTypeIcon(document.fileType)

  const handleDelete = () => {
    onDelete(document.id)
    setDeleteDialogOpen(false)
  }

  return (
    <>
      <Card
        className="group cursor-pointer hover:border-primary/50 transition-colors"
        onClick={() => onView(document.id)}
      >
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <div className="flex items-start gap-3">
            <div className={`rounded-lg p-2 ${bgColor}`}>
              <FileIcon className={`h-4 w-4 ${iconColor}`} />
            </div>
            <div className="space-y-1">
              <CardTitle className="text-sm font-medium line-clamp-2">
                {document.title}
              </CardTitle>
              <div className="flex gap-1 flex-wrap">
                {document.categories.slice(0, 2).map((cat) => {
                  const { label, color } = getCategoryDisplay(cat, categoryMap)
                  return (
                    <Badge
                      key={cat}
                      variant="secondary"
                      style={{ backgroundColor: `${color}20`, color: color, borderColor: color }}
                    >
                      {label}
                    </Badge>
                  )
                })}
                {document.categories.length > 2 && (
                  <Badge variant="outline">+{document.categories.length - 2}</Badge>
                )}
              </div>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 opacity-0 group-hover:opacity-100"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onView(document.id); }}>
                <Eye className="h-4 w-4 mr-2" />
                View
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(document.id); }}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); setDeleteDialogOpen(true); }}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Layers className="h-3 w-3" />
              <span>{document.chunkCount} chunks</span>
            </div>
            <span>
              {formatDistanceToNow(new Date(document.createdAt), {
                addSuffix: true,
              })}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {document.groups.slice(0, 2).map((group) => (
              <div key={group.id} className="flex items-center gap-1 text-xs text-muted-foreground">
                <div
                  className="h-3 w-3 rounded flex items-center justify-center"
                  style={{ backgroundColor: group.color || "#3b82f6" }}
                >
                  <Folder className="h-2 w-2 text-white" />
                </div>
                <span>{group.name}</span>
              </div>
            ))}
            {document.groups.length > 2 && (
              <span className="text-xs text-muted-foreground">+{document.groups.length - 2} more</span>
            )}
            {document.subcategory && (
              <span className="text-xs text-muted-foreground">
                {document.subcategory}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

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
