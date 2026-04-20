"use client"

import { useState } from "react"
import { Sparkles, ArrowRight, Loader2 } from "@/lib/icons"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { WizardTranscript } from "./wizard-transcript"
import type { WizardTurn } from "../hooks/use-wizard-stream"

const SUGGESTIONS = [
  {
    label: "Customer support",
    prompt:
      "A friendly customer support agent that handles refunds, shipping questions, and order status.",
  },
  {
    label: "Research assistant",
    prompt:
      "A research assistant that searches the web, summarizes findings, and cites sources.",
  },
  {
    label: "Sales SDR",
    prompt:
      "An outbound SDR that qualifies leads, drafts personalized outreach, and books meetings.",
  },
  {
    label: "Code reviewer",
    prompt:
      "A senior code reviewer that checks PRs for bugs, style, and security issues.",
  },
]

interface Props {
  turns: WizardTurn[]
  streaming: boolean
  error: string | null
  onSend: (text: string) => void
}

export function WizardHero({ turns, streaming, error, onSend }: Props) {
  const [input, setInput] = useState("")
  const hasConversation = turns.length > 0

  const submit = () => {
    if (!input.trim() || streaming) return
    onSend(input)
    setInput("")
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-8">
      {!hasConversation && (
        <div className="text-center space-y-2 pt-8">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Sparkles className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Build an agent
          </h1>
          <p className="text-sm text-muted-foreground">
            Describe what you want it to do — I&apos;ll handle the rest.
          </p>
        </div>
      )}

      {hasConversation && (
        <WizardTranscript turns={turns} streaming={streaming} variant="hero" />
      )}

      <div
        className={cn(
          "relative rounded-2xl border bg-background shadow-sm transition-shadow",
          "focus-within:shadow-md focus-within:border-primary/40"
        )}
      >
        <Textarea
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            hasConversation
              ? "Reply…"
              : "e.g. A friendly support agent that answers refund and shipping questions…"
          }
          rows={3}
          className="resize-none border-0 bg-transparent p-4 pr-14 text-sm focus-visible:ring-0 shadow-none"
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
          className="absolute bottom-3 right-3 h-9 w-9 rounded-xl"
        >
          {streaming ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowRight className="h-4 w-4" />
          )}
        </Button>
      </div>

      {error && (
        <p className="text-xs text-destructive text-center">{error}</p>
      )}

      {!hasConversation && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground text-center">
            Or try one of these
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.label}
                type="button"
                disabled={streaming}
                onClick={() => onSend(s.prompt)}
                className="group rounded-full border bg-background px-3.5 py-1.5 text-xs hover:border-primary/40 hover:bg-primary/5 transition-colors disabled:opacity-50"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
