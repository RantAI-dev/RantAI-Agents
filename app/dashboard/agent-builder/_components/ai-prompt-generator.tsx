"use client"

import { useState } from "react"
import { Sparkles, Loader2, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface AiPromptGeneratorProps {
  currentPrompt: string
  onGenerated: (result: {
    systemPrompt: string
    suggestedName: string
    suggestedEmoji: string
  }) => void
}

export function AiPromptGenerator({
  currentPrompt,
  onGenerated,
}: AiPromptGeneratorProps) {
  const [description, setDescription] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingResult, setPendingResult] = useState<{
    systemPrompt: string
    suggestedName: string
    suggestedEmoji: string
  } | null>(null)

  const handleGenerate = async () => {
    if (!description.trim() || description.trim().length < 5) return

    setIsGenerating(true)
    setError(null)

    try {
      const response = await fetch("/api/assistants/generate-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: description.trim() }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || "Failed to generate prompt")
      }

      const result = await response.json()

      // If there's an existing prompt, ask for confirmation
      if (currentPrompt.trim().length > 0) {
        setPendingResult(result)
      } else {
        onGenerated(result)
        setDescription("")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate prompt")
    } finally {
      setIsGenerating(false)
    }
  }

  const handleConfirmReplace = () => {
    if (pendingResult) {
      onGenerated(pendingResult)
      setPendingResult(null)
      setDescription("")
    }
  }

  return (
    <>
      <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <Label className="text-sm font-medium text-primary">Generate with AI</Label>
        </div>
        <p className="text-xs text-muted-foreground">
          Describe your agent in a sentence and let AI generate a complete system prompt.
        </p>
        <div className="flex gap-2">
          <Input
            value={description}
            onChange={(e) => {
              setDescription(e.target.value)
              setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isGenerating) handleGenerate()
            }}
            placeholder="e.g. A travel planning assistant that helps book flights and hotels"
            className="flex-1 text-sm bg-background"
            disabled={isGenerating}
          />
          <Button
            size="sm"
            onClick={handleGenerate}
            disabled={isGenerating || description.trim().length < 5}
            className="shrink-0"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                Generate
              </>
            )}
          </Button>
        </div>
        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}
      </div>

      <AlertDialog open={!!pendingResult} onOpenChange={(open) => !open && setPendingResult(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace current prompt?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace your existing system prompt with the AI-generated one.
              {pendingResult?.suggestedName && (
                <span className="block mt-2">
                  Suggested name: <strong>{pendingResult.suggestedEmoji} {pendingResult.suggestedName}</strong>
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmReplace}>
              Replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
