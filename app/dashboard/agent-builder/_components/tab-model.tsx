"use client"

import { Eye, Wrench, Zap } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ModelSelectorDropdown } from "./model-selector-dropdown"
import { ModelParamSlider } from "./model-param-slider"
import { getModelById } from "@/lib/models"
import type { ModelConfig } from "@/lib/types/assistant"

interface TabModelProps {
  model: string
  modelConfig: ModelConfig
  onModelChange: (model: string) => void
  onModelConfigChange: (config: ModelConfig) => void
}

// Models that support reasoning effort parameter
const REASONING_MODELS = ["openai/o3-mini", "deepseek/deepseek-r1"]

function isReasoningModel(modelId: string): boolean {
  return REASONING_MODELS.some((id) => modelId.startsWith(id) || modelId.includes("o3") || modelId.includes("deepseek-r1"))
}

export function TabModel({
  model,
  modelConfig,
  onModelChange,
  onModelConfigChange,
}: TabModelProps) {
  const modelInfo = getModelById(model)

  const updateConfig = (key: keyof ModelConfig, value: ModelConfig[keyof ModelConfig]) => {
    onModelConfigChange({ ...modelConfig, [key]: value })
  }

  const clearConfig = (key: keyof ModelConfig) => {
    const next = { ...modelConfig }
    delete next[key]
    onModelConfigChange(next)
  }

  return (
    <div className="p-6 max-w-3xl space-y-8">
      {/* Model Selection */}
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Model</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Choose the LLM that powers this agent.
          </p>
        </div>

        <ModelSelectorDropdown selectedModelId={model} onSelect={onModelChange} />

        {/* Selected model details card */}
        {modelInfo && (
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{modelInfo.name}</span>
              <span className="text-xs text-muted-foreground">{modelInfo.provider}</span>
            </div>
            <p className="text-xs text-muted-foreground">{modelInfo.description}</p>
            <div className="flex items-center gap-2 flex-wrap">
              {modelInfo.capabilities.functionCalling && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 gap-1">
                  <Wrench className="h-3 w-3" />
                  Tool Use
                </Badge>
              )}
              {modelInfo.capabilities.vision && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 gap-1">
                  <Eye className="h-3 w-3" />
                  Vision
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 gap-1">
                <Zap className="h-3 w-3" />
                {(modelInfo.contextWindow / 1000).toFixed(0)}k context
              </Badge>
              {modelInfo.pricing.input === 0 && modelInfo.pricing.output === 0 ? (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
                  Free
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
                  ${modelInfo.pricing.input} / ${modelInfo.pricing.output} per M tokens
                </Badge>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Model Parameters */}
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Model Parameters</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Fine-tune how the model generates responses. Toggle each parameter to override the model default.
          </p>
        </div>

        <div className="space-y-3">
          <ModelParamSlider
            label="Creativity Level"
            paramKey="temperature"
            description="Higher values produce more creative and varied responses; lower values produce more focused and deterministic output."
            value={modelConfig.temperature}
            enabled={modelConfig.temperature != null}
            onEnabledChange={(enabled) => {
              if (enabled) updateConfig("temperature", 1.0)
              else clearConfig("temperature")
            }}
            onValueChange={(v) => updateConfig("temperature", v)}
            min={0}
            max={2}
            step={0.1}
            defaultValue={1.0}
          />

          <ModelParamSlider
            label="Openness to Ideas"
            paramKey="top_p"
            description="Controls diversity via nucleus sampling. Lower values make output more focused; higher values allow more variety."
            tooltip="It is not recommended to change this alongside the temperature."
            value={modelConfig.topP}
            enabled={modelConfig.topP != null}
            onEnabledChange={(enabled) => {
              if (enabled) updateConfig("topP", 1.0)
              else clearConfig("topP")
            }}
            onValueChange={(v) => updateConfig("topP", v)}
            min={0}
            max={1}
            step={0.05}
            defaultValue={1.0}
          />

          <ModelParamSlider
            label="Max Output Tokens"
            paramKey="max_tokens"
            description="The maximum number of tokens the model can generate in a single response."
            value={modelConfig.maxTokens}
            enabled={modelConfig.maxTokens != null}
            onEnabledChange={(enabled) => {
              if (enabled) updateConfig("maxTokens", 4096)
              else clearConfig("maxTokens")
            }}
            onValueChange={(v) => updateConfig("maxTokens", Math.round(v))}
            min={1}
            max={32768}
            step={256}
            defaultValue={4096}
          />

          <ModelParamSlider
            label="Expression Divergence"
            paramKey="presence_penalty"
            description="Higher values encourage the model to use different expressions and avoid concept repetition; lower values produce more consistent expression."
            value={modelConfig.presencePenalty}
            enabled={modelConfig.presencePenalty != null}
            onEnabledChange={(enabled) => {
              if (enabled) updateConfig("presencePenalty", 0)
              else clearConfig("presencePenalty")
            }}
            onValueChange={(v) => updateConfig("presencePenalty", v)}
            min={-2}
            max={2}
            step={0.1}
            defaultValue={0}
          />

          <ModelParamSlider
            label="Repetition Penalty"
            paramKey="frequency_penalty"
            description="Higher values reduce the likelihood of repeated phrases and words in the response."
            value={modelConfig.frequencyPenalty}
            enabled={modelConfig.frequencyPenalty != null}
            onEnabledChange={(enabled) => {
              if (enabled) updateConfig("frequencyPenalty", 0)
              else clearConfig("frequencyPenalty")
            }}
            onValueChange={(v) => updateConfig("frequencyPenalty", v)}
            min={-2}
            max={2}
            step={0.1}
            defaultValue={0}
          />

          {/* Reasoning Effort - only for reasoning models */}
          {isReasoningModel(model) && (
            <div className="flex items-start gap-4 rounded-lg border p-4">
              <div className="flex-1 min-w-0 space-y-3">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium">Reasoning Effort</Label>
                  <code className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    reasoning_effort
                  </code>
                </div>
                <p className="text-xs text-muted-foreground">
                  Higher values enhance reasoning ability but may increase response time and token usage.
                </p>
                {modelConfig.reasoningEffort != null && (
                  <Select
                    value={modelConfig.reasoningEffort || "medium"}
                    onValueChange={(v) => updateConfig("reasoningEffort", v as "low" | "medium" | "high")}
                  >
                    <SelectTrigger className="w-40 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="shrink-0 mt-0.5">
                <input
                  type="checkbox"
                  checked={modelConfig.reasoningEffort != null}
                  onChange={(e) => {
                    if (e.target.checked) updateConfig("reasoningEffort", "medium")
                    else clearConfig("reasoningEffort")
                  }}
                  className="h-4 w-4 rounded border-input"
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Response Format */}
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Response Format</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Control how the model formats its responses.
          </p>
        </div>
        <Select
          value={modelConfig.responseFormat || "default"}
          onValueChange={(v) => updateConfig("responseFormat", v as ModelConfig["responseFormat"])}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Default</SelectItem>
            <SelectItem value="json">JSON Mode</SelectItem>
            <SelectItem value="markdown">Markdown</SelectItem>
            <SelectItem value="concise">Concise</SelectItem>
            <SelectItem value="detailed">Detailed</SelectItem>
          </SelectContent>
        </Select>
      </section>
    </div>
  )
}
