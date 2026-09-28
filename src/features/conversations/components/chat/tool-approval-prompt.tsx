"use client"

import { useState } from "react"
import { ShieldAlert, Check, X, Loader2 } from "@/lib/icons"
import { Button } from "@/components/ui/button"

/**
 * Approve/Deny control for a gated tool call (QA CHAT-037). The server holds
 * the call open until POST /api/chat/tool-approval resolves it — see
 * src/lib/tools/approval.ts for the other half.
 */
export type ToolApprovalState = "pending" | "submitting" | "approved" | "denied" | "failed"

/** Tool names from the X-Tool-Approval response header. */
export function parseApprovalGatedTools(header: string | null): Set<string> {
  if (!header) return new Set()
  return new Set(
    header
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  )
}

function summarizeArgs(args?: Record<string, unknown>): string {
  if (!args) return ""
  const text = JSON.stringify(args)
  return text.length > 280 ? `${text.slice(0, 280)}…` : text
}

export function ToolApprovalPrompt({
  toolName,
  args,
  state,
  onDecide,
}: {
  toolName: string
  args?: Record<string, unknown>
  state: ToolApprovalState
  onDecide: (approved: boolean) => void
}) {
  const [showArgs, setShowArgs] = useState(false)
  const argsText = summarizeArgs(args)

  if (state === "approved") {
    return (
      <p className="mt-1 mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Check className="h-3 w-3" /> Allowed <code className="font-mono">{toolName}</code> to run
      </p>
    )
  }
  if (state === "denied") {
    return (
      <p className="mt-1 mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <X className="h-3 w-3" /> Denied <code className="font-mono">{toolName}</code> — it did not run
      </p>
    )
  }

  return (
    <div
      role="alertdialog"
      aria-label={`Approve ${toolName}?`}
      className="mt-1 mb-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm"
    >
      <div className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            Allow <code className="font-mono">{toolName}</code> to run?
          </p>
          <p className="text-xs text-muted-foreground">
            This action can have effects outside this chat. It will not run unless you allow it.
          </p>
          {argsText && (
            <button
              type="button"
              className="mt-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => setShowArgs((v) => !v)}
            >
              {showArgs ? "Hide details" : "Show details"}
            </button>
          )}
          {showArgs && argsText && (
            <pre className="mt-1 max-h-32 overflow-auto rounded bg-muted p-2 text-[11px] whitespace-pre-wrap break-all">
              {argsText}
            </pre>
          )}
          {state === "failed" && (
            <p className="mt-1 text-xs text-destructive">
              Couldn&apos;t send your answer — the request may have ended. Try again.
            </p>
          )}
          <div className="mt-2 flex gap-2">
            <Button size="sm" disabled={state === "submitting"} onClick={() => onDecide(true)}>
              {state === "submitting" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Allow"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={state === "submitting"}
              onClick={() => onDecide(false)}
            >
              Deny
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
