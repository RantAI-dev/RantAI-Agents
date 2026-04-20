"use client"

import { useState } from "react"
import { Sparkles, ArrowRight, Loader2, ChevronDown } from "@/lib/icons"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { WizardTranscript } from "./wizard-transcript"
import type { WizardTurn } from "../hooks/use-wizard-stream"

interface Props {
  turns: WizardTurn[]
  streaming: boolean
  error: string | null
  onSend: (text: string) => void
}

const REFINE_SUGGESTIONS = [
  "Make it more concise",
  "Add a tool for sending email",
  "Make the tone more formal",
]

export function WizardRefineBar({ turns, streaming, error, onSend }: Props) {
  const [input, setInput] = useState("")
  const [showHistory, setShowHistory] = useState(false)
  const hasHistory = turns.length > 0

  const submit = () => {
    if (!input.trim() || streaming) return
    onSend(input)
    setInput("")
    setShowHistory(true)
  }

  return (
    <div className="sticky bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-background via-background to-background/0 pt-6 pb-4">
      <div className="mx-auto max-w-3xl px-4 space-y-2">
        {showHistory && hasHistory && (
          <div className="rounded-2xl border bg-card/60 p-3 backdrop-blur">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">
                Recent refinements
              </span>
              <button
                type="button"
                onClick={() => setShowHistory(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Hide
              </button>
            </div>
            <WizardTranscript
              turns={turns}
              streaming={streaming}
              variant="compact"
            />
          </div>
        )}

        {!showHistory && hasHistory && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setShowHistory(true)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronDown className="h-3 w-3" />
              Show refinement history ({turns.filter((t) => t.role === "user").length})
            </button>
          </div>
        )}

        {!hasHistory && (
          <div className="flex flex-wrap justify-center gap-1.5">
            {REFINE_SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                disabled={streaming}
                onClick={() => onSend(s)}
                className="rounded-full border bg-background/80 backdrop-blur px-3 py-1 text-xs hover:border-primary/40 hover:bg-primary/5 transition-colors disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div
          className={cn(
            "relative rounded-2xl border bg-background shadow-md",
            "focus-within:border-primary/40"
          )}
        >
          <div className="absolute left-3 top-3 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tweak — e.g. add a tool, change the tone, expand the goal…"
            rows={2}
            className="resize-none border-0 bg-transparent pl-10 pr-14 py-2.5 text-sm focus-visible:ring-0 shadow-none min-h-[60px]"
            disabled={streaming}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
          />
          <Button
            type="button"
            size="icon"
            onClick={submit}
            disabled={streaming || !input.trim()}
            className="absolute bottom-2.5 right-2.5 h-8 w-8 rounded-lg"
          >
            {streaming ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ArrowRight className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>

        {error && (
          <p className="text-xs text-destructive text-center">{error}</p>
        )}
      </div>
    </div>
  )
}
