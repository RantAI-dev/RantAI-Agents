"use client"

import { useState } from "react"
import { Calendar, Webhook, Copy, Trash2, Loader2, ToggleLeft, ToggleRight } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"
import { useEmployeeTriggers, type TriggerItem } from "@/hooks/use-employee-triggers"
import { TriggerCreateDialog } from "./trigger-create-dialog"

interface TriggerListProps {
  employeeId: string
}

export function TriggerList({ employeeId }: TriggerListProps) {
  const { triggers, isLoading, createTrigger, updateTrigger, deleteTrigger } = useEmployeeTriggers(employeeId)
  const [createOpen, setCreateOpen] = useState(false)

  const getWebhookUrl = (token: string) => {
    if (typeof window !== "undefined") {
      return `${window.location.origin}/api/webhooks/employees/${token}`
    }
    return `/api/webhooks/employees/${token}`
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success("Copied to clipboard")
  }

  const handleToggle = async (trigger: TriggerItem) => {
    try {
      await updateTrigger(trigger.id, { enabled: !trigger.enabled })
      toast.success(trigger.enabled ? "Disabled" : "Enabled")
    } catch {
      toast.error("Failed to update")
    }
  }

  const handleDelete = async (trigger: TriggerItem) => {
    try {
      await deleteTrigger(trigger.id)
      toast.success("Trigger deleted")
    } catch {
      toast.error("Failed to delete")
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="px-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {triggers.length} trigger{triggers.length !== 1 ? "s" : ""}
        </p>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setCreateOpen(true)}>
          Add Trigger
        </Button>
      </div>

      {triggers.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          No triggers configured. Add a cron schedule or webhook to automate runs.
        </div>
      ) : (
        <div className="space-y-2">
          {triggers.map((trigger) => (
            <div key={trigger.id} className="rounded-lg border bg-card p-3">
              <div className="flex items-center gap-3">
                {trigger.type === "cron" ? (
                  <Calendar className="h-4 w-4 text-blue-500 shrink-0" />
                ) : (
                  <Webhook className="h-4 w-4 text-purple-500 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{trigger.name}</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {trigger.type}
                    </Badge>
                    {!trigger.enabled && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-muted text-muted-foreground">
                        disabled
                      </Badge>
                    )}
                  </div>
                  {trigger.type === "cron" && typeof trigger.config?.cron === "string" && (
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">
                      {trigger.config.cron as string}
                    </p>
                  )}
                  {trigger.type === "webhook" && trigger.token && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <code className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                        {getWebhookUrl(trigger.token)}
                      </code>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 w-5 p-0"
                        onClick={() => handleCopy(getWebhookUrl(trigger.token!))}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                    {trigger.triggerCount > 0 && (
                      <span>{trigger.triggerCount} trigger{trigger.triggerCount !== 1 ? "s" : ""}</span>
                    )}
                    {trigger.lastTriggeredAt && (
                      <span>Last: {formatDistanceToNow(new Date(trigger.lastTriggeredAt), { addSuffix: true })}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Switch
                    checked={trigger.enabled}
                    onCheckedChange={() => handleToggle(trigger)}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-red-500"
                    onClick={() => handleDelete(trigger)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <TriggerCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={async (input) => {
          try {
            await createTrigger(input)
            toast.success("Trigger created")
            setCreateOpen(false)
          } catch {
            toast.error("Failed to create trigger")
          }
        }}
      />
    </div>
  )
}
