"use client"

import { Check, Eye, Wrench } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { AVAILABLE_MODELS, type LLMModel } from "@/lib/models"

interface ModelSelectorCardsProps {
  selectedModelId: string
  onSelect: (modelId: string) => void
}

export function ModelSelectorCards({ selectedModelId, onSelect }: ModelSelectorCardsProps) {
  // Group by provider
  const grouped: Record<string, LLMModel[]> = {}
  for (const model of AVAILABLE_MODELS) {
    if (!grouped[model.provider]) grouped[model.provider] = []
    grouped[model.provider].push(model)
  }

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([provider, models]) => (
        <div key={provider}>
          <h4 className="text-xs font-medium text-muted-foreground mb-2">{provider}</h4>
          <div className="grid grid-cols-1 gap-2">
            {models.map((model) => {
              const isSelected = selectedModelId === model.id
              return (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => onSelect(model.id)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  )}
                >
                  <div
                    className={cn(
                      "h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0",
                      isSelected
                        ? "border-primary bg-primary"
                        : "border-muted-foreground/30"
                    )}
                  >
                    {isSelected && <Check className="h-3 w-3 text-white" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{model.name}</span>
                      {model.pricing.input === 0 && model.pricing.output === 0 && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                          Free
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {model.description}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {model.capabilities.functionCalling && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 gap-0.5">
                          <Wrench className="h-2.5 w-2.5" />
                          Tools
                        </Badge>
                      )}
                      {model.capabilities.vision && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 gap-0.5">
                          <Eye className="h-2.5 w-2.5" />
                          Vision
                        </Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {(model.contextWindow / 1000).toFixed(0)}k ctx
                      </span>
                      {model.pricing.input > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          ${model.pricing.input}/${model.pricing.output} per M
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
