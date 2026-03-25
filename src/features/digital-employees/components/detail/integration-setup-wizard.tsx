"use client"

import { useState } from "react"
import { Check, Copy, Loader2 } from "@/lib/icons"
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
import { DynamicIcon } from "@/components/ui/dynamic-icon"
import { Plug } from "@/lib/icons"
import type { EmployeeIntegrationItem } from "@/hooks/use-employee-integrations"

interface IntegrationSetupWizardProps {
  integration: EmployeeIntegrationItem | null
  employeeId: string
  onClose: () => void
  onConnect: (integrationId: string, credentials: Record<string, string>, metadata?: Record<string, unknown>) => Promise<void>
  onOpenChat?: (message: string) => void
}

export function IntegrationSetupWizard({
  integration,
  employeeId,
  onClose,
  onConnect,
  onOpenChat,
}: IntegrationSetupWizardProps) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [postConnectInfo, setPostConnectInfo] = useState<{ id: string; values: Record<string, string> } | null>(null)

  const handleOpen = (open: boolean) => {
    if (!open) {
      onClose()
      setValues({})
      setPostConnectInfo(null)
    }
  }

  const handleSubmit = async () => {
    if (!integration) return
    setIsSaving(true)
    try {
      await onConnect(integration.id, values)
      toast.success(`${integration.name} connected`)
      // Show post-connect info for WhatsApp integrations
      if (integration.id === "whatsapp" || integration.id === "whatsapp-web") {
        setPostConnectInfo({ id: integration.id, values: { ...values } })
      } else {
        onClose()
        setValues({})
      }
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
              <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-muted">
                <DynamicIcon
                  icon={integration.icon}
                  fallback={Plug}
                  className="h-5 w-5"
                  emojiClassName="text-xl leading-none"
                />
              </div>
              <div>
                <SheetTitle className="text-base">{integration.name}</SheetTitle>
                <SheetDescription className="text-xs mt-0.5">{integration.description}</SheetDescription>
              </div>
            </div>
          </SheetHeader>
          <div className="mt-5 space-y-4 px-6">
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

  // Post-connect info panel for WhatsApp integrations
  if (postConnectInfo) {
    const webhookUrl = typeof window !== "undefined"
      ? `${window.location.origin}/api/webhooks/whatsapp/${employeeId}`
      : `/api/webhooks/whatsapp/${employeeId}`

    return (
      <Sheet open={!!integration} onOpenChange={handleOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader className="pb-4 border-b">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-emerald-500/10 text-emerald-500">
                <Check className="h-5 w-5" />
              </div>
              <div>
                <SheetTitle className="text-base">{integration.name} Connected</SheetTitle>
                <SheetDescription className="text-xs mt-0.5">Complete the setup below</SheetDescription>
              </div>
            </div>
          </SheetHeader>
          <div className="mt-5 space-y-4 px-6">
            {postConnectInfo.id === "whatsapp" && (
              <>
                <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
                  <p className="text-sm font-medium">Configure in Meta Business Suite:</p>
                  <div className="space-y-2">
                    <CopyField label="Webhook URL" value={webhookUrl} />
                    <CopyField label="Verify Token" value={postConnectInfo.values.verifyToken || ""} />
                  </div>
                </div>
                <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground space-y-1.5">
                  <p className="font-medium text-foreground">Steps:</p>
                  <ol className="list-decimal ml-4 space-y-1">
                    <li>Go to Meta App Dashboard → WhatsApp → Configuration</li>
                    <li>Click &quot;Edit&quot; under Webhook</li>
                    <li>Paste the Webhook URL and Verify Token above</li>
                    <li>Subscribe to &quot;messages&quot; webhook field</li>
                    <li>Restart the employee container to apply</li>
                  </ol>
                </div>
              </>
            )}
            {postConnectInfo.id === "whatsapp-web" && (
              <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
                <p className="text-sm font-medium">Pairing Instructions:</p>
                <div className="text-xs text-muted-foreground space-y-2">
                  <p>Pairing will start automatically when the employee container starts.</p>
                  <ol className="list-decimal ml-4 space-y-1">
                    <li>Start (or restart) the employee</li>
                    <li>Check the employee chat — a pairing code will appear</li>
                    <li>On your phone: WhatsApp → Linked Devices → Link a Device</li>
                    <li>Choose &quot;Link with phone number instead&quot;</li>
                    <li>Enter the pairing code shown in the chat</li>
                  </ol>
                </div>
              </div>
            )}
            <Button onClick={handleOpen.bind(null, false)} className="w-full">Done</Button>
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
            <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-muted">
              <DynamicIcon
                icon={integration.icon}
                fallback={Plug}
                className="h-5 w-5"
                emojiClassName="text-xl leading-none"
              />
            </div>
            <div>
              <SheetTitle className="text-base">Set up {integration.name}</SheetTitle>
              <SheetDescription className="text-xs mt-0.5">{integration.description}</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <div className="mt-5 space-y-4 px-6">
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

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex items-center gap-1.5">
        <code className="flex-1 text-xs bg-background rounded px-2 py-1.5 border font-mono break-all">{value}</code>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleCopy}>
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  )
}
