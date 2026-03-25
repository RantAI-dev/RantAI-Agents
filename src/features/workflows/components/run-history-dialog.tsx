"use client"

import { ArrowLeft } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { RunHistory } from "./run-history"
import { RunDetail } from "./run-detail"
import type { WorkflowRunItem } from "@/hooks/use-workflow-runs"

interface RunHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  runs: WorkflowRunItem[]
  runsLoading: boolean
  activeRun: WorkflowRunItem | null
  onSelectRun: (run: WorkflowRunItem) => void
  onClearRun: () => void
  onResume?: (stepId: string, data: unknown) => void
}

export function RunHistoryDialog({
  open,
  onOpenChange,
  runs,
  runsLoading,
  activeRun,
  onSelectRun,
  onClearRun,
  onResume,
}: RunHistoryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {activeRun && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 -ml-1"
                onClick={onClearRun}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            {activeRun ? `Run ${activeRun.id.slice(0, 8)}` : "Run History"}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          {activeRun ? (
            <RunDetail run={activeRun} onResume={onResume} />
          ) : (
            <RunHistory
              runs={runs}
              activeRunId={null}
              onSelectRun={onSelectRun}
              isLoading={runsLoading}
            />
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
