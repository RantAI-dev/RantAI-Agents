"use client"

import { useState } from "react"
import { Loader2 } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { toast } from "sonner"
import type { EmployeeIntegrationItem } from "@/hooks/use-employee-integrations"

interface IntegrationSetupWizardProps {
  integration: EmployeeIntegrationItem | null
  onClose: () => void
  onConnect: (integrationId: string, credentials: Record<string, string>, metadata?: Record<string, unknown>) => Promise<void>
  onOpenChat?: (message: string) => void
}

export function IntegrationSetupWizard({
  integration,
  onClose,
  onConnect,
  onOpenChat,
}: IntegrationSetupWizardProps) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)

  const handleOpen = (open: boolean) => {
    if (!open) {
      onClose()
      setValues({})
    }
  }

  const handleSubmit = async () => {
    if (!integration) return
    setIsSaving(true)
    try {
      await onConnect(integration.id, values)
      toast.success(`${integration.name} connected`)
      onClose()
      setValues({})
    } catch {
      toast.error(`Failed to connect ${integration.name}`)
    } finally {
      setIsSaving(false)
    }
  }

  if (!integration) return null

  // Chat-guided integrations open the chat drawer instead
  if (integration.setupType === "chat-guided" && onOpenChat) {
    return (
      <Sheet open={!!integration} onOpenChange={handleOpen}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader className="pb-4 border-b">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-muted text-xl">
                {integration.icon}
              </div>
              <div>
                <SheetTitle className="text-base">{integration.name}</SheetTitle>
                <SheetDescription className="text-xs mt-0.5">{integration.description}</SheetDescription>
              </div>
            </div>
          </SheetHeader>
          <div className="mt-5 space-y-4">
            <div className="rounded-lg border border-dashed p-4 text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                This integration is best set up through a guided conversation with your employee.
              </p>
              <Button
                onClick={() => {
                  onOpenChat(`Help me set up the ${integration.name} integration. I need to configure ${integration.description}.`)
                  onClose()
                }}
                className="w-full"
              >
                Start Setup Chat
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  const requiredFields = integration.fields.filter((f) => f.required)
  const allRequiredFilled = requiredFields.every((f) => values[f.key]?.trim())

  return (
    <Sheet open={!!integration} onOpenChange={handleOpen}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-4 border-b">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-muted text-xl">
              {integration.icon}
            </div>
            <div>
              <SheetTitle className="text-base">Set up {integration.name}</SheetTitle>
              <SheetDescription className="text-xs mt-0.5">{integration.description}</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <div className="mt-5 space-y-4">
          {integration.fields.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={`field-${field.key}`} className="text-sm font-medium">
                {field.label}
                {field.required && <span className="text-red-500 ml-0.5">*</span>}
              </Label>
              {field.type === "textarea" ? (
                <Textarea
                  id={`field-${field.key}`}
                  value={values[field.key] || ""}
                  onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  className="bg-muted/50 border-border/50 focus:bg-background transition-colors"
                  rows={3}
                />
              ) : (
                <Input
                  id={`field-${field.key}`}
                  type={field.type === "password" ? "password" : "text"}
                  value={values[field.key] || ""}
                  onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  className="bg-muted/50 border-border/50 focus:bg-background transition-colors"
                />
              )}
              {field.helpText && (
                <p className="text-[11px] text-muted-foreground leading-relaxed">{field.helpText}</p>
              )}
            </div>
          ))}
          <div className="flex gap-2 pt-4 border-t">
            <Button onClick={handleSubmit} disabled={isSaving || !allRequiredFilled} className="flex-1">
              {isSaving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {integration.status === "connected" ? "Update" : "Connect"}
            </Button>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
