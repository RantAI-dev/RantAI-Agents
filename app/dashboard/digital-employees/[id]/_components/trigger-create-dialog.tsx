"use client"

import { useState } from "react"
import { Calendar, Webhook, Loader2 } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

interface TriggerCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (input: { type: string; name: string; config?: Record<string, unknown> }) => Promise<void>
}

const TRIGGER_TYPES = [
  { value: "cron", label: "Cron Schedule", icon: Calendar, description: "Run on a recurring schedule" },
  { value: "webhook", label: "Webhook", icon: Webhook, description: "Trigger via HTTP POST" },
]

const CRON_PRESETS = [
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Daily at 9am", value: "0 9 * * *" },
  { label: "Weekdays at 9am", value: "0 9 * * 1-5" },
  { label: "Weekly (Monday)", value: "0 9 * * 1" },
]

export function TriggerCreateDialog({ open, onOpenChange, onCreate }: TriggerCreateDialogProps) {
  const [type, setType] = useState<string>("cron")
  const [name, setName] = useState("")
  const [cron, setCron] = useState("0 * * * *")
  const [isCreating, setIsCreating] = useState(false)

  const handleCreate = async () => {
    setIsCreating(true)
    try {
      await onCreate({
        type,
        name: name.trim(),
        config: type === "cron" ? { cron } : {},
      })
      setName("")
      setCron("0 * * * *")
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Trigger</DialogTitle>
          <DialogDescription>Choose how to trigger runs for this employee.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {/* Type selector */}
          <div className="grid grid-cols-2 gap-2">
            {TRIGGER_TYPES.map((t) => {
              const Icon = t.icon
              return (
                <button
                  key={t.value}
                  onClick={() => setType(t.value)}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    type === t.value ? "border-foreground bg-foreground/5" : "hover:bg-muted/50"
                  )}
                >
                  <Icon className="h-4 w-4 mb-1" />
                  <p className="text-sm font-medium">{t.label}</p>
                  <p className="text-[11px] text-muted-foreground">{t.description}</p>
                </button>
              )
            })}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="trigger-name">Name</Label>
            <Input
              id="trigger-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={type === "cron" ? "e.g. Morning check-in" : "e.g. GitHub push webhook"}
            />
          </div>

          {type === "cron" && (
            <div className="space-y-1.5">
              <Label htmlFor="cron-expr">Cron Expression</Label>
              <Input
                id="cron-expr"
                value={cron}
                onChange={(e) => setCron(e.target.value)}
                placeholder="0 * * * *"
                className="font-mono text-sm"
              />
              <div className="flex flex-wrap gap-1">
                {CRON_PRESETS.map((preset) => (
                  <Button
                    key={preset.value}
                    size="sm"
                    variant={cron === preset.value ? "secondary" : "ghost"}
                    className="h-6 text-[11px] px-2"
                    onClick={() => setCron(preset.value)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {type === "webhook" && (
            <p className="text-xs text-muted-foreground">
              A unique webhook URL will be generated after creation. Send a POST request to trigger a run.
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={isCreating || !name.trim()}>
              {isCreating && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Create
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
