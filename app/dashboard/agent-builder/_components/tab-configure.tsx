"use client"

import { Headphones } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { ModelSelectorCards } from "./model-selector-cards"
import { PromptTemplatePicker } from "./prompt-template-picker"
import type { MemoryConfig } from "@/lib/types/assistant"

const EMOJI_OPTIONS = ["💬", "🤖", "🧠", "📚", "🎯", "💡", "🔮", "⭐", "🌟", "🏠", "💼", "🎧"]

interface TabConfigureProps {
  name: string
  description: string
  emoji: string
  model: string
  systemPrompt: string
  liveChatEnabled: boolean
  onNameChange: (v: string) => void
  onDescriptionChange: (v: string) => void
  onEmojiChange: (v: string) => void
  onModelChange: (v: string) => void
  onSystemPromptChange: (v: string) => void
  onLiveChatEnabledChange: (v: boolean) => void
}

export function TabConfigure({
  name,
  description,
  emoji,
  model,
  systemPrompt,
  liveChatEnabled,
  onNameChange,
  onDescriptionChange,
  onEmojiChange,
  onModelChange,
  onSystemPromptChange,
  onLiveChatEnabledChange,
}: TabConfigureProps) {
  const handleTemplatePick = (prompt: string, templateEmoji: string) => {
    onSystemPromptChange(prompt)
    onEmojiChange(templateEmoji)
  }

  return (
    <div className="p-6 max-w-3xl space-y-8">
      {/* Identity */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Identity</h2>

        {/* Emoji Picker */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Emoji</Label>
          <div className="flex flex-wrap gap-2">
            {EMOJI_OPTIONS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => onEmojiChange(e)}
                className={cn(
                  "text-2xl p-1.5 rounded-lg transition-all",
                  emoji === e
                    ? "bg-primary/10 ring-2 ring-primary scale-110"
                    : "hover:bg-muted"
                )}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="agent-name">Name</Label>
          <Input
            id="agent-name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="My Agent"
          />
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="agent-description">Description</Label>
          <Input
            id="agent-description"
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder="What does this agent do?"
          />
        </div>
      </section>

      {/* Model */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Model</h2>
        <ModelSelectorCards selectedModelId={model} onSelect={onModelChange} />
      </section>

      {/* System Prompt */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground">System Prompt</h2>

        <PromptTemplatePicker
          currentPrompt={systemPrompt}
          onSelect={handleTemplatePick}
        />

        <Textarea
          value={systemPrompt}
          onChange={(e) => onSystemPromptChange(e.target.value)}
          placeholder="You are a helpful assistant..."
          className="min-h-[300px] font-mono text-sm"
        />
      </section>

      {/* Live Chat Handoff */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Live Chat Handoff</h2>
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <Headphones className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Enable Live Chat</p>
              <p className="text-xs text-muted-foreground">
                Allow the AI to hand off conversations to human agents via the Live Chat queue
              </p>
            </div>
          </div>
          <Switch
            checked={liveChatEnabled}
            onCheckedChange={onLiveChatEnabledChange}
          />
        </div>
      </section>
    </div>
  )
}
