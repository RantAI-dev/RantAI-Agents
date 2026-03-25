"use client"

import { useState } from "react"
import { Check, Plus } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { EMPLOYEE_TEMPLATES, type EmployeeTemplate } from "@/lib/digital-employee/templates/employee-templates"
import { SpotlightCard } from "@/components/reactbits/spotlight-card"

interface SharedTemplate {
  id: string
  name: string
  description: string | null
  category: string
  templateData: Record<string, unknown>
  isPublic: boolean
}

interface TemplateGalleryProps {
  selectedTemplateId: string | null
  onSelect: (template: EmployeeTemplate | null) => void
  orgTemplates: SharedTemplate[]
}

export function TemplateGallery({ selectedTemplateId, onSelect, orgTemplates }: TemplateGalleryProps) {
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)

  const categories = Array.from(new Set(EMPLOYEE_TEMPLATES.map((t) => t.category)))
  const filtered = categoryFilter
    ? EMPLOYEE_TEMPLATES.filter((t) => t.category === categoryFilter)
    : EMPLOYEE_TEMPLATES

  return (
    <div className="space-y-4">
      {/* Category filter */}
      <div className="flex items-center gap-1 flex-wrap">
        <Button
          size="sm"
          variant={categoryFilter === null ? "secondary" : "ghost"}
          className="h-7 text-xs"
          onClick={() => setCategoryFilter(null)}
        >
          All
        </Button>
        {categories.map((cat) => (
          <Button
            key={cat}
            size="sm"
            variant={categoryFilter === cat ? "secondary" : "ghost"}
            className="h-7 text-xs"
            onClick={() => setCategoryFilter(cat)}
          >
            {cat}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Start from scratch */}
        <SpotlightCard
          className={cn(
            "rounded-lg border bg-card cursor-pointer transition-all hover:border-foreground/30",
            selectedTemplateId === null && "border-foreground ring-1 ring-foreground/20"
          )}
          spotlightColor="rgba(var(--primary-rgb, 124,58,237), 0.06)"
          onClick={() => onSelect(null)}
        >
          <div className="p-4 flex items-start gap-3 h-full">
            <div className="rounded-lg bg-muted p-2">
              <Plus className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium">Start from Scratch</h3>
                {selectedTemplateId === null && <Check className="h-4 w-4 text-emerald-500 shrink-0" />}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Build a custom employee with your own configuration.
              </p>
            </div>
          </div>
        </SpotlightCard>

        {filtered.map((template) => (
          <SpotlightCard
            key={template.id}
            className={cn(
              "rounded-lg border bg-card cursor-pointer transition-all hover:border-foreground/30",
              selectedTemplateId === template.id && "border-foreground ring-1 ring-foreground/20"
            )}
            spotlightColor="rgba(var(--primary-rgb, 124,58,237), 0.06)"
            onClick={() => onSelect(template)}
          >
            <div className="p-4 flex items-start gap-3">
              <span className="text-2xl">{template.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium truncate">{template.name}</h3>
                  {selectedTemplateId === template.id && <Check className="h-4 w-4 text-emerald-500 shrink-0" />}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  {template.description}
                </p>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{template.category}</Badge>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{template.suggestedAutonomy}</Badge>
                </div>
              </div>
            </div>
          </SpotlightCard>
        ))}
      </div>

      {orgTemplates.length > 0 && (
        <div className="space-y-2 mt-6">
          <h3 className="text-sm font-medium text-muted-foreground">Organization Templates</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {orgTemplates.map((template) => {
              const data = template.templateData
              const icon = (data.icon as string) || "\u{1F4CB}"
              const autonomy = (data.autonomyLevel as string) || "L2"
              return (
                <SpotlightCard
                  key={template.id}
                  className={cn(
                    "rounded-lg border bg-card cursor-pointer transition-all hover:border-foreground/30",
                    selectedTemplateId === template.id && "border-foreground ring-1 ring-foreground/20"
                  )}
                  spotlightColor="rgba(var(--primary-rgb, 124,58,237), 0.06)"
                  onClick={() => {
                    onSelect({
                      id: template.id,
                      name: template.name,
                      description: template.description || "",
                      icon,
                      category: template.category,
                      suggestedAutonomy: autonomy,
                      identity: {
                        name: template.name,
                        description: template.description || "",
                        avatar: icon,
                      },
                      tags: [template.category],
                      blueprint: {
                        tools: (data.tools as string[]) || [],
                        skills: (data.skills as string[]) || [],
                        integrations: (data.integrations as string[]) || [],
                      },
                    })
                  }}
                >
                  <div className="p-4 flex items-start gap-3">
                    <span className="text-2xl">{icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium truncate">{template.name}</h3>
                        {selectedTemplateId === template.id && <Check className="h-4 w-4 text-emerald-500 shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {template.description || "Organization template"}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{template.category}</Badge>
                        {template.isPublic && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Public</Badge>}
                      </div>
                    </div>
                  </div>
                </SpotlightCard>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
