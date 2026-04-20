"use client"

import { useEffect, useRef } from "react"
import { Sparkles, Loader2 } from "@/lib/icons"
import { cn } from "@/lib/utils"
import type { WizardTurn } from "../hooks/use-wizard-stream"

interface Props {
  turns: WizardTurn[]
  streaming: boolean
  className?: string
  variant?: "hero" | "compact"
}

export function WizardTranscript({
  turns,
  streaming,
  className,
  variant = "hero",
}: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ref.current?.scrollTo({
      top: ref.current.scrollHeight,
      behavior: "smooth",
    })
  }, [turns])

  if (turns.length === 0) return null

  return (
    <div
      ref={ref}
      className={cn(
        "space-y-3 overflow-y-auto",
        variant === "hero" ? "max-h-[40vh]" : "max-h-[200px]",
        className
      )}
    >
      {turns.map((t) => {
        const isLast = t.id === turns[turns.length - 1]?.id
        const isThinking = streaming && isLast && t.role === "assistant" && !t.content
        return (
          <div
            key={t.id}
            className={cn(
              "flex gap-2.5 text-sm leading-relaxed",
              t.role === "user" ? "justify-end" : "justify-start"
            )}
          >
            {t.role === "assistant" && (
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
            )}
            <div
              className={cn(
                "whitespace-pre-wrap rounded-2xl px-3.5 py-2 max-w-[80%]",
                t.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/60 text-foreground"
              )}
            >
              {isThinking ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                t.content
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
