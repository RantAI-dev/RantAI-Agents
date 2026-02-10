"use client"

import { Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  WORKFLOW_TEMPLATES,
  type WorkflowTemplate,
} from "@/lib/templates/workflow-templates"

interface WorkflowTemplateGalleryProps {
  onUseTemplate: (template: WorkflowTemplate) => Promise<void>
  isCreating: boolean
}

export function WorkflowTemplateGallery({
  onUseTemplate,
  isCreating,
}: WorkflowTemplateGalleryProps) {
  return (
    <div className="mb-6">
      <div className="mb-3">
        <h3 className="text-sm font-semibold">Start from a Template</h3>
        <p className="text-xs text-muted-foreground">
          Pre-built workflow patterns — click to create
        </p>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {WORKFLOW_TEMPLATES.map((template) => (
          <button
            key={template.id}
            onClick={() => onUseTemplate(template)}
            disabled={isCreating}
            className="group relative flex-shrink-0 w-[200px] rounded-lg border border-dashed border-primary/30 bg-primary/[0.02] p-4 text-left transition-all hover:border-primary/60 hover:bg-primary/[0.05] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreating && (
              <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/80">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            )}
            <div className="text-2xl mb-2">{template.icon}</div>
            <div className="text-sm font-medium mb-1 truncate">
              {template.name}
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2 mb-2 min-h-[2rem]">
              {template.description}
            </p>
            <div className="flex flex-wrap gap-1">
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0"
              >
                {template.nodes.length} nodes
              </Badge>
              {template.tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="text-[10px] px-1.5 py-0"
                >
                  {tag}
                </Badge>
              ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
