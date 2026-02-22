"use client"

import { Plus, X, MessageCircle, HelpCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

interface OpeningSettingsProps {
  openingMessage: string
  openingQuestions: string[]
  onOpeningMessageChange: (message: string) => void
  onOpeningQuestionsChange: (questions: string[]) => void
}

const MAX_QUESTIONS = 4

export function OpeningSettings({
  openingMessage,
  openingQuestions,
  onOpeningMessageChange,
  onOpeningQuestionsChange,
}: OpeningSettingsProps) {
  const addQuestion = () => {
    if (openingQuestions.length < MAX_QUESTIONS) {
      onOpeningQuestionsChange([...openingQuestions, ""])
    }
  }

  const updateQuestion = (index: number, value: string) => {
    const next = [...openingQuestions]
    next[index] = value
    onOpeningQuestionsChange(next)
  }

  const removeQuestion = (index: number) => {
    onOpeningQuestionsChange(openingQuestions.filter((_, i) => i !== index))
  }

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-foreground">Opening Settings</h2>

      {/* Opening Message */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
          <MessageCircle className="h-3.5 w-3.5" />
          Opening Message
        </Label>
        <Textarea
          value={openingMessage}
          onChange={(e) => onOpeningMessageChange(e.target.value)}
          placeholder="Hello! I'm your assistant. How can I help you today?"
          className="min-h-[80px] text-sm"
        />
        <p className="text-[10px] text-muted-foreground">
          Displayed when a new conversation starts. Introduces the agent&apos;s capabilities.
        </p>
      </div>

      {/* Conversation Starters */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
          <HelpCircle className="h-3.5 w-3.5" />
          Conversation Starters
        </Label>
        <p className="text-[10px] text-muted-foreground">
          Suggested prompts displayed as clickable buttons to help users start quickly.
        </p>

        <div className="space-y-2">
          {openingQuestions.map((question, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                value={question}
                onChange={(e) => updateQuestion(index, e.target.value)}
                placeholder={`e.g. "What can you help me with?"`}
                className="flex-1 text-sm"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeQuestion(index)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}

          {openingQuestions.length < MAX_QUESTIONS && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={addQuestion}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add Question
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}
