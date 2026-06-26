"use client"

import { useEffect, useRef } from "react"
import { Sparkles, Loader2 } from "@/lib/icons"
import { cn } from "@/lib/utils"
import { MarkdownContent } from "@/features/conversations/components/chat/markdown-content"
import type { WizardTurn } from "../hooks/use-wizard-stream"

interface Props {
  turns: WizardTurn[]
  streaming: boolean
  className?: string
  variant?: "hero" | "compact" | "full"
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
        "overflow-y-auto",
        variant === "hero"
          ? "max-h-[40vh]"
          : variant === "compact"
            ? "max-h-[200px]"
            : "h-full",
        className
      )}
    >
      <div className="mx-auto w-full max-w-3xl space-y-4 px-4 sm:px-6 py-5">
        {turns.map((t) => {
          const isLast = t.id === turns[turns.length - 1]?.id
          const isThinking =
            streaming && isLast && t.role === "assistant" && !t.content
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
                  "rounded-2xl px-3.5 py-2",
                  t.role === "user"
                    ? "max-w-[80%] whitespace-pre-wrap bg-primary text-primary-foreground"
                    : "max-w-[85%] bg-muted/60 text-foreground"
                )}
              >
                {isThinking ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : t.role === "assistant" ? (
                  <MarkdownContent
                    content={t.content}
                    isStreaming={streaming && isLast}
                    className="chat-message max-w-none text-sm leading-relaxed"
                  />
                ) : (
                  t.content
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
