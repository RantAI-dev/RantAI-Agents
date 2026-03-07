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
        <SheetContent>
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <span className="text-xl">{integration.icon}</span>
              {integration.name}
            </SheetTitle>
            <SheetDescription>{integration.description}</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              This integration is best set up through a guided conversation with your employee.
            </p>
            <Button
              onClick={() => {
                onOpenChat(`Help me set up the ${integration.name} integration. I need to configure ${integration.description}.`)
                onClose()
              }}
            >
              Start Setup Chat
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  const requiredFields = integration.fields.filter((f) => f.required)
  const allRequiredFilled = requiredFields.every((f) => values[f.key]?.trim())

  return (
    <Sheet open={!!integration} onOpenChange={handleOpen}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span className="text-xl">{integration.icon}</span>
            Set up {integration.name}
          </SheetTitle>
          <SheetDescription>{integration.description}</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          {integration.fields.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={`field-${field.key}`}>
                {field.label}
                {field.required && <span className="text-red-500 ml-0.5">*</span>}
              </Label>
              {field.type === "textarea" ? (
                <Textarea
                  id={`field-${field.key}`}
                  value={values[field.key] || ""}
                  onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  rows={3}
                />
              ) : (
                <Input
                  id={`field-${field.key}`}
                  type={field.type === "password" ? "password" : "text"}
                  value={values[field.key] || ""}
                  onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                />
              )}
              {field.helpText && (
                <p className="text-[11px] text-muted-foreground">{field.helpText}</p>
              )}
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSubmit} disabled={isSaving || !allRequiredFilled}>
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
