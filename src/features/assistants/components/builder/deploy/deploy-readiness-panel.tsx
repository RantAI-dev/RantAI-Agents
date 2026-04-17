"use client"

import { CheckCircle2, AlertCircle } from "@/lib/icons"
import type { DeployReadiness } from "@/features/assistants/core/completeness"

const LABELS: Record<DeployReadiness["missing"][number], string> = {
  name: "Name",
  systemPrompt: "System Prompt (20+ chars)",
  model: "Model",
  openingMessage: "Opening Message (required for live chat)",
}

interface Props {
  readiness: DeployReadiness
  onJumpTo: (field: DeployReadiness["missing"][number]) => void
}

export function DeployReadinessPanel({ readiness, onJumpTo }: Props) {
  if (readiness.ok) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3">
        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        <p className="text-sm">Ready to deploy.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-destructive" />
        <p className="text-sm font-medium">Not ready to deploy</p>
      </div>
      <ul className="space-y-1 pl-6">
        {readiness.missing.map((field) => (
          <li key={field} className="text-xs">
            <button
              type="button"
              onClick={() => onJumpTo(field)}
              className="text-destructive hover:underline"
            >
              Missing: {LABELS[field]}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
