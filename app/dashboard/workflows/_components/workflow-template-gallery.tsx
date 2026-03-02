"use client"

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
import {
  WORKFLOW_TEMPLATES,
  type WorkflowTemplate,
} from "@/lib/templates/workflow-templates"

const MAX_VISIBLE_TAGS = 2

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}

interface WorkflowTemplateGalleryProps {
  onUseTemplate: (template: WorkflowTemplate) => Promise<void>
  isCreating: boolean
}

export function WorkflowTemplateGallery({
  onUseTemplate,
  isCreating,
}: WorkflowTemplateGalleryProps) {
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
          {WORKFLOW_TEMPLATES.map((template) => {
            const allBadges = [`${template.nodes.length} nodes`, ...template.tags]
            const visibleBadges = allBadges.slice(0, MAX_VISIBLE_TAGS)
            const hiddenBadges = allBadges.slice(MAX_VISIBLE_TAGS)
            return (
              <motion.button
                key={template.id}
                variants={fadeUp}
                transition={{ type: "spring", stiffness: 260, damping: 24 }}
                onClick={() => onUseTemplate(template)}
                disabled={isCreating}
                className="group relative flex-shrink-0 w-[200px] h-[164px] rounded-lg border border-dashed border-primary/30 bg-primary/[0.02] p-4 text-left transition-all hover:border-primary/60 hover:bg-primary/[0.05] hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/80 z-10">
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
                <div className="flex gap-1 items-center h-5">
                  {visibleBadges.map((badge, i) => (
                    <Badge
                      key={badge}
                      variant={i === 0 ? "outline" : "secondary"}
                      className="text-[10px] px-1.5 py-0 shrink-0"
                    >
                      {badge}
                    </Badge>
                  ))}
                  {hiddenBadges.length > 0 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-[10px] text-muted-foreground font-medium shrink-0 cursor-default">
                          +{hiddenBadges.length}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="flex flex-wrap gap-1 max-w-[200px]">
                        {hiddenBadges.map((badge) => (
                          <Badge
                            key={badge}
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0"
                          >
                            {badge}
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
