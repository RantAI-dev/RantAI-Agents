"use client"

import { ArrowLeft, RotateCcw, Loader2 } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"

interface Props {
  hasDraft: boolean
  canCreate: boolean
  isCreating: boolean
  onCreate: () => void
  onReset: () => void
  onSkipToManual: () => Promise<void>
}

export function WizardActionBar({
  hasDraft,
  canCreate,
  isCreating,
  onCreate,
  onReset,
  onSkipToManual,
}: Props) {
  const router = useRouter()
  return (
    <div className="flex items-center gap-2 min-h-14 border-b bg-background/95 backdrop-blur sticky top-0 z-20 pl-12 pr-4 py-2 shrink-0">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={() => router.push("/dashboard/agent-builder")}
        aria-label="Back"
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>

      <div className="flex-1" />

      {hasDraft && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          disabled={isCreating}
          className="text-muted-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
          Start over
        </Button>
      )}

      {!hasDraft && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onSkipToManual}
          disabled={isCreating}
          className="text-muted-foreground"
        >
          Skip to manual
        </Button>
      )}

      {hasDraft && (
        <Button
          size="sm"
          onClick={onCreate}
          disabled={!canCreate || isCreating}
          className="min-w-[110px]"
        >
          {isCreating ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              Creating…
            </>
          ) : (
            "Create agent"
          )}
        </Button>
      )}
    </div>
  )
}
