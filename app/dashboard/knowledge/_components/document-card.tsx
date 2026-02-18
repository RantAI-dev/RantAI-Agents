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
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { MoreVertical, Trash2, Layers, Eye, Pencil } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { useState } from "react"
import { getFileTypeIcon, getCategoryDisplay, getFileExtensionLabel } from "./file-type-utils"

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

interface DocumentCardProps {
  document: Document
  onDelete: (id: string) => void
  onView: (id: string) => void
  onEdit: (id: string) => void
  categoryMap: Map<string, Category>
}

export function DocumentCard({ document, onDelete, onView, onEdit, categoryMap }: DocumentCardProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const { Icon: FileIcon, bgColor, iconColor, accentColor } = getFileTypeIcon(document.fileType, document.artifactType)

  const handleDelete = () => {
    onDelete(document.id)
    setDeleteDialogOpen(false)
  }

  return (
    <>
      <Card
        className="group relative cursor-pointer transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:border-primary/50 hover:-translate-y-1 flex flex-col min-h-[180px] overflow-hidden"
        style={{ borderTop: `2.5px solid ${accentColor}` }}
        onClick={() => onView(document.id)}
      >
        <span
          className="absolute bottom-2.5 right-3 text-[11px] font-mono font-bold opacity-80"
          style={{ color: accentColor }}
        >
          {getFileExtensionLabel(document.fileType, document.artifactType)}
        </span>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pt-4 pb-2">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div
              className={`rounded-xl p-2.5 shrink-0 ring-1 ring-inset ring-black/5 dark:ring-white/5 ${bgColor}`}
              aria-hidden
            >
              <FileIcon className={`h-5 w-5 ${iconColor}`} />
            </div>
            <div className="space-y-1.5 min-w-0">
              <CardTitle className="text-sm font-semibold leading-snug line-clamp-2">
                {document.title}
              </CardTitle>
              <div className="flex gap-1.5 flex-wrap items-center">
                {document.categories.slice(0, 2).map((cat) => {
                  const { label, color } = getCategoryDisplay(cat, categoryMap)
                  return (
                    <Badge
                      key={cat}
                      className="text-[10px] font-medium h-5 px-1.5 border-0 shrink-0"
                      style={{
                        backgroundColor: `color-mix(in oklch, ${color} 12%, transparent)`,
                        color,
                      }}
                    >
                      {label}
                    </Badge>
                  )
                })}
                {document.categories.length > 2 && (
                  <Badge variant="outline" className="text-[10px] h-5 px-1.5 shrink-0">
                    +{document.categories.length - 2}
                  </Badge>
                )}
                {document.groups.length > 0 && (
                  <>
                    {document.groups.slice(0, 3).map((group) => (
                      <Tooltip key={group.id}>
                        <TooltipTrigger asChild>
                          <div
                            className="h-3 w-3 rounded-sm shrink-0"
                            style={{ backgroundColor: group.color ?? "var(--chart-3)" }}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          {group.name}
                        </TooltipContent>
                      </Tooltip>
                    ))}
                    {document.groups.length > 3 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{document.groups.length - 3}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
                aria-label="Document actions"
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
        <CardContent className="mt-auto pt-0">
          <Separator className="mb-3" />
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
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
