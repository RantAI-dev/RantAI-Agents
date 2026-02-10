"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { AGENT_TEMPLATES, type AgentTemplate } from "@/lib/templates/agent-templates"
import { resolveToolNameToIds } from "@/lib/templates/utils"
import type { AssistantInput } from "@/lib/types/assistant"

interface AgentTemplateGalleryProps {
  addAssistant: (input: AssistantInput) => Promise<{ id: string } | null>
  refetch: () => void
}

export function AgentTemplateGallery({
  addAssistant,
  refetch,
}: AgentTemplateGalleryProps) {
  const router = useRouter()
  const [creatingId, setCreatingId] = useState<string | null>(null)

  const handleUseTemplate = async (template: AgentTemplate) => {
    if (creatingId) return
    setCreatingId(template.id)

    try {
      const created = await addAssistant({
        name: template.name,
        description: template.description,
        emoji: template.emoji,
        systemPrompt: template.systemPrompt,
        model: template.model,
        useKnowledgeBase: template.useKnowledgeBase,
        knowledgeBaseGroupIds: template.knowledgeBaseGroupIds,
        memoryConfig: template.memoryConfig,
      })

      if (created) {
        // Resolve tool names to IDs and bind them
        if (template.suggestedToolNames.length > 0) {
          try {
            const toolIds = await resolveToolNameToIds(template.suggestedToolNames)
            if (toolIds.length > 0) {
              await fetch(`/api/assistants/${created.id}/tools`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ toolIds }),
              })
            }
          } catch {
            // Tool binding failed, but agent was created
          }
        }

        refetch()
        router.push(`/dashboard/agent-builder/${created.id}`)
      }
    } finally {
      setCreatingId(null)
    }
  }

  return (
    <div className="mb-6">
      <div className="mb-3">
        <h3 className="text-sm font-semibold">Start from a Template</h3>
        <p className="text-xs text-muted-foreground">
          Pre-configured agents ready to use — click to create
        </p>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {AGENT_TEMPLATES.map((template) => {
          const isCreating = creatingId === template.id
          return (
            <button
              key={template.id}
              onClick={() => handleUseTemplate(template)}
              disabled={!!creatingId}
              className="group relative flex-shrink-0 w-[200px] rounded-lg border border-dashed border-primary/30 bg-primary/[0.02] p-4 text-left transition-all hover:border-primary/60 hover:bg-primary/[0.05] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreating && (
                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/80">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              )}
              <div className="text-2xl mb-2">{template.emoji}</div>
              <div className="text-sm font-medium mb-1 truncate">
                {template.name}
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2 mb-2 min-h-[2rem]">
                {template.description}
              </p>
              <div className="flex flex-wrap gap-1">
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
          )
        })}
      </div>
    </div>
  )
}
