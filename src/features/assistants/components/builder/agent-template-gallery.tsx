"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Loader2 } from "@/lib/icons"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ShinyText } from "@/components/reactbits/shiny-text"
import { AGENT_TEMPLATES, type AgentTemplate } from "@/lib/templates/agent-templates"
import { resolveToolNameToIds } from "@/lib/templates/utils"
import type { AssistantInput } from "@/lib/types/assistant"

const MAX_VISIBLE_TAGS = 2

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}

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
        tags: template.tags,
      })

      if (created) {
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
    <TooltipProvider delayDuration={300}>
      <motion.div
        className="mb-6"
        initial="hidden"
        animate="visible"
        variants={{
          visible: { transition: { staggerChildren: 0.05, delayChildren: 0.2 } },
        }}
      >
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-sm font-semibold">Templates</h3>
          <ShinyText className="text-[10px] font-semibold text-primary/80 uppercase tracking-wider">
            New
          </ShinyText>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {AGENT_TEMPLATES.map((template) => {
            const isCreating = creatingId === template.id
            const visibleTags = template.tags.slice(0, MAX_VISIBLE_TAGS)
            const hiddenTags = template.tags.slice(MAX_VISIBLE_TAGS)
            return (
              <motion.button
                key={template.id}
                variants={fadeUp}
                transition={{ type: "spring", stiffness: 260, damping: 24 }}
                onClick={() => handleUseTemplate(template)}
                disabled={!!creatingId}
                className="group relative flex-shrink-0 w-[200px] h-[164px] rounded-lg border border-dashed border-primary/30 bg-primary/[0.02] p-4 text-left transition-all hover:border-primary/60 hover:bg-primary/[0.05] hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/80 z-10">
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
                <div className="flex gap-1 items-center h-5">
                  {visibleTags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0 shrink-0"
                    >
                      {tag}
                    </Badge>
                  ))}
                  {hiddenTags.length > 0 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-[10px] text-muted-foreground font-medium shrink-0 cursor-default">
                          +{hiddenTags.length}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="flex flex-wrap gap-1 max-w-[200px]">
                        {hiddenTags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </motion.button>
            )
          })}
        </div>
      </motion.div>
    </TooltipProvider>
  )
}
