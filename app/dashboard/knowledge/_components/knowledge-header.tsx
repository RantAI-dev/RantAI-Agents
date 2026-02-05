"use client"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Plus, MoreHorizontal, Pencil, Trash2, Folder } from "lucide-react"
import { DashboardPageHeader } from "../../_components/dashboard-page-header"

export interface KnowledgeBaseHeader {
  id: string
  name: string
  color: string | null
}

interface KnowledgeHeaderProps {
  selectedKB: KnowledgeBaseHeader | null
  documentCount: number
  onAddDocument: () => void
  onEditKB?: () => void
  onDeleteKB?: () => void
}

export function KnowledgeHeader({
  selectedKB,
  documentCount,
  onAddDocument,
  onEditKB,
  onDeleteKB,
}: KnowledgeHeaderProps) {
  const leftContent = selectedKB ? (
    <>
      <div
        className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: selectedKB.color ?? "var(--chart-3)" }}
        aria-hidden
      >
        <Folder className="h-5 w-5 text-white" />
      </div>
      <div className="min-w-0 flex items-baseline gap-2 flex-wrap">
        <h1 className="text-lg font-semibold truncate">{selectedKB.name}</h1>
        <span className="text-sm text-muted-foreground shrink-0">
          {documentCount} document{documentCount !== 1 ? "s" : ""}
        </span>
      </div>
    </>
  ) : (
    <div className="min-w-0 flex items-baseline gap-2 flex-wrap">
      <h1 className="text-lg font-semibold">All Documents</h1>
      <span className="text-sm text-muted-foreground shrink-0">
        {documentCount} document{documentCount !== 1 ? "s" : ""}
      </span>
    </div>
  )

  const actions = (
    <>
      {selectedKB && (onEditKB || onDeleteKB) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Knowledge base options">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onEditKB && (
              <DropdownMenuItem onClick={onEditKB}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit Knowledge Base
              </DropdownMenuItem>
            )}
            {onDeleteKB && (
              <DropdownMenuItem
                onClick={onDeleteKB}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Knowledge Base
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Button onClick={onAddDocument}>
        <Plus className="h-4 w-4 mr-2" />
        Add Document
      </Button>
    </>
  )

  return (
    <DashboardPageHeader actions={actions}>
      {leftContent}
    </DashboardPageHeader>
  )
}
