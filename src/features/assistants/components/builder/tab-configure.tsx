"use client"

import { useState } from "react"
import { Headphones, X } from "@/lib/icons"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { getTagColor } from "@/lib/utils"
import { AvatarPicker } from "./avatar-picker"
import { OpeningSettings } from "./opening-settings"
import { StructuredPromptEditor } from "./structured-prompt-editor"
import { PromptTemplatePicker } from "./prompt-template-picker"
import { PromptVariables } from "./prompt-variables"
import { isNameValid, isSystemPromptValid } from "@/features/assistants/core/completeness"

interface TabConfigureProps {
  name: string
  description: string
  emoji: string
  avatarUrl?: string | null
  systemPrompt: string
  liveChatEnabled: boolean
  openingMessage: string
  openingQuestions: string[]
  isNew: boolean
  onNameChange: (v: string) => void
  onDescriptionChange: (v: string) => void
  onEmojiChange: (v: string) => void
  onAvatarUpload: (s3Key: string, url: string) => void
  onAvatarRemove: () => void
  onSystemPromptChange: (v: string) => void
  onLiveChatEnabledChange: (v: boolean) => void
  onOpeningMessageChange: (v: string) => void
  onOpeningQuestionsChange: (v: string[]) => void
  tags: string[]
  onTagsChange: (v: string[]) => void
}

export function TabConfigure({
  name,
  description,
  emoji,
  avatarUrl,
  systemPrompt,
  liveChatEnabled,
  openingMessage,
  openingQuestions,
  isNew,
  onNameChange,
  onDescriptionChange,
  onEmojiChange,
  onAvatarUpload,
  onAvatarRemove,
  onSystemPromptChange,
  onLiveChatEnabledChange,
  onOpeningMessageChange,
  onOpeningQuestionsChange,
  tags,
  onTagsChange,
}: TabConfigureProps) {
  const [tagInput, setTagInput] = useState("")
  const [nameTouched, setNameTouched] = useState(false)
  const [promptTouched, setPromptTouched] = useState(false)
  const nameError = nameTouched && !isNameValid(name)
  const promptError = promptTouched && !isSystemPromptValid(systemPrompt)

  const addTag = (value: string) => {
    const trimmed = value.trim()
    if (trimmed && !tags.includes(trimmed)) {
      onTagsChange([...tags, trimmed])
    }
    setTagInput("")
  }

  const removeTag = (tag: string) => {
    onTagsChange(tags.filter((t) => t !== tag))
  }
  const handleSystemPromptChange = (v: string) => {
    onSystemPromptChange(v)
    setPromptTouched(true)
  }

  const handleTemplatePick = (prompt: string, templateEmoji: string) => {
    handleSystemPromptChange(prompt)
    onEmojiChange(templateEmoji)
  }

  return (
    <div className="p-6 space-y-8">
      {/* Identity */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Identity</h2>

        <div className="flex items-start gap-4">
          {/* Avatar/Emoji Picker */}
          <AvatarPicker
            emoji={emoji}
            avatarUrl={avatarUrl}
            onEmojiChange={onEmojiChange}
            onAvatarUpload={onAvatarUpload}
            onAvatarRemove={onAvatarRemove}
          />

          {/* Name & Description */}
          <div className="flex-1 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="agent-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="agent-name"
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                onBlur={() => setNameTouched(true)}
                placeholder="My Agent"
                aria-invalid={nameError}
                className={nameError ? "border-destructive" : ""}
              />
              {nameError && (
                <p className="text-xs text-destructive">Name is required.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agent-description">Description</Label>
              <Input
                id="agent-description"
                value={description}
                onChange={(e) => onDescriptionChange(e.target.value)}
                placeholder="What does this agent do?"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agent-tags">Tags</Label>
              <div className="flex flex-wrap gap-1.5 min-h-[36px] rounded-md border px-3 py-2 items-center">
                {tags.map((tag) => {
                  const color = getTagColor(tag)
                  return (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="text-xs gap-1 shrink-0"
                      style={{ borderColor: color, color }}
                    >
                      {tag}
                      <button
                        type="button"
                        className="hover:opacity-70"
                        onClick={() => removeTag(tag)}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  )
                })}
                <input
                  id="agent-tags"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      addTag(tagInput)
                    }
                    if (e.key === "Backspace" && !tagInput && tags.length > 0) {
                      removeTag(tags[tags.length - 1])
                    }
                  }}
                  onBlur={() => { if (tagInput.trim()) addTag(tagInput) }}
                  placeholder={tags.length === 0 ? "Add tags (press Enter)" : ""}
                  className="flex-1 min-w-[100px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Opening Settings */}
      <OpeningSettings
        openingMessage={openingMessage}
        openingQuestions={openingQuestions}
        onOpeningMessageChange={onOpeningMessageChange}
        onOpeningQuestionsChange={onOpeningQuestionsChange}
      />

      {/* System Prompt */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground">
          System Prompt <span className="text-destructive">*</span>
        </h2>

        <PromptTemplatePicker
          currentPrompt={systemPrompt}
          onSelect={handleTemplatePick}
        />

        <StructuredPromptEditor
          systemPrompt={systemPrompt}
          onSystemPromptChange={handleSystemPromptChange}
          defaultStructured={isNew}
        />

        <PromptVariables
          onInsert={(token) => {
            handleSystemPromptChange(systemPrompt + token)
          }}
        />

        {promptError && (
          <p className="text-xs text-destructive">
            System prompt must be at least 20 characters.
          </p>
        )}
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
