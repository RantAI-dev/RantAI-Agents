"use client"

import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { HelpCircle } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface ModelParamSliderProps {
  label: string
  paramKey: string
  description: string
  tooltip?: string
  value: number | undefined
  enabled: boolean
  onEnabledChange: (enabled: boolean) => void
  onValueChange: (value: number) => void
  min: number
  max: number
  step: number
  defaultValue: number
}

export function ModelParamSlider({
  label,
  paramKey,
  description,
  tooltip,
  value,
  enabled,
  onEnabledChange,
  onValueChange,
  min,
  max,
  step,
  defaultValue,
}: ModelParamSliderProps) {
  const displayValue = value ?? defaultValue

  return (
    <div className="flex items-start gap-4 rounded-lg border p-4">
      <div className="flex-1 min-w-0 space-y-3">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium">{label}</Label>
          {tooltip && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="text-xs">{tooltip}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <code className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {paramKey}
          </code>
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>

        {enabled && (
          <div className="flex items-center gap-3">
            <Slider
              value={[displayValue]}
              onValueChange={([v]) => onValueChange(v)}
              min={min}
              max={max}
              step={step}
              className="flex-1"
            />
            <Input
              type="number"
              value={displayValue}
              onChange={(e) => {
                const v = parseFloat(e.target.value)
                if (!isNaN(v) && v >= min && v <= max) {
                  onValueChange(v)
                }
              }}
              min={min}
              max={max}
              step={step}
              className="w-20 h-8 text-sm text-center"
            />
          </div>
        )}
      </div>

      <Switch
        checked={enabled}
        onCheckedChange={onEnabledChange}
        className="shrink-0 mt-0.5"
      />
    </div>
  )
}
