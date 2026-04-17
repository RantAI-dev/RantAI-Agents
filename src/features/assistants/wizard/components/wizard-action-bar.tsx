"use client"

import { ArrowLeft, Sparkles, RotateCcw, ChevronRight } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"

interface Props {
  canCreate: boolean
  isCreating: boolean
  onCreate: () => void
  onReset: () => void
  onSkipToManual: () => Promise<void>
}

export function WizardActionBar({
  canCreate,
  isCreating,
  onCreate,
  onReset,
  onSkipToManual,
}: Props) {
  const router = useRouter()
  return (
    <div className="flex items-center gap-2 min-h-14 border-b bg-background pl-12 pr-4 py-2 shrink-0">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={() => router.push("/dashboard/agent-builder")}
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>

      <div className="flex-1 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h1 className="text-base font-semibold">New Agent — AI Wizard</h1>
      </div>

      <Button variant="ghost" size="sm" onClick={onReset}>
        <RotateCcw className="h-4 w-4 mr-1.5" />
        Start over
      </Button>

      <Button variant="outline" size="sm" onClick={onSkipToManual}>
        <ChevronRight className="h-4 w-4 mr-1.5" />
        Skip to manual editor
      </Button>

      <Button size="sm" onClick={onCreate} disabled={!canCreate || isCreating}>
        {isCreating ? "Creating…" : "Create Agent"}
      </Button>
    </div>
  )
}
