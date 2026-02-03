"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2 } from "lucide-react"
import { useAssistants } from "@/hooks/use-assistants"
import type { EmbedApiKeyResponse, EmbedApiKeyInput, WidgetConfig } from "@/lib/embed/types"
import { DEFAULT_WIDGET_CONFIG } from "@/lib/embed/types"

interface EmbedKeyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingKey: EmbedApiKeyResponse | null
  onSave: (input: EmbedApiKeyInput) => Promise<void>
}

export function EmbedKeyDialog({
  open,
  onOpenChange,
  editingKey,
  onSave,
}: EmbedKeyDialogProps) {
  const { assistants, isLoading: assistantsLoading } = useAssistants()
  const [saving, setSaving] = useState(false)

  // Form state
  const [name, setName] = useState("")
  const [assistantId, setAssistantId] = useState("")
  const [domains, setDomains] = useState("")
  const [config, setConfig] = useState<WidgetConfig>(DEFAULT_WIDGET_CONFIG)

  // Reset form when dialog opens/closes or editing key changes
  useEffect(() => {
    if (editingKey) {
      setName(editingKey.name)
      setAssistantId(editingKey.assistantId)
      setDomains(editingKey.allowedDomains.join("\n"))
      setConfig({ ...DEFAULT_WIDGET_CONFIG, ...editingKey.config })
    } else {
      setName("")
      setAssistantId(assistants[0]?.id || "")
      setDomains("")
      setConfig(DEFAULT_WIDGET_CONFIG)
    }
  }, [editingKey, open, assistants])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !assistantId) return

    setSaving(true)
    try {
      const allowedDomains = domains
        .split("\n")
        .map((d) => d.trim())
        .filter(Boolean)

      await onSave({
        name,
        assistantId,
        allowedDomains,
        config,
      })
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  const updateConfig = (updates: Partial<WidgetConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }))
  }

  const updateTheme = (
    key: keyof WidgetConfig["theme"],
    value: string
  ) => {
    setConfig((prev) => ({
      ...prev,
      theme: { ...prev.theme, [key]: value },
    }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingKey ? "Edit API Key" : "Create API Key"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Website Widget"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                A friendly name to identify this API key
              </p>
            </div>

            <div>
              <Label htmlFor="assistant">Assistant</Label>
              <Select
                value={assistantId}
                onValueChange={setAssistantId}
                disabled={assistantsLoading || !!editingKey}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an assistant" />
                </SelectTrigger>
                <SelectContent>
                  {assistants.map((assistant) => (
                    <SelectItem key={assistant.id} value={assistant.id}>
                      {assistant.emoji} {assistant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editingKey && (
                <p className="text-xs text-muted-foreground mt-1">
                  Assistant cannot be changed after creation
                </p>
              )}
            </div>
          </div>

          {/* Configuration Tabs */}
          <Tabs defaultValue="security" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="security">Security</TabsTrigger>
              <TabsTrigger value="appearance">Appearance</TabsTrigger>
              <TabsTrigger value="behavior">Behavior</TabsTrigger>
            </TabsList>

            {/* Security Tab */}
            <TabsContent value="security" className="space-y-4 mt-4">
              <div>
                <Label htmlFor="domains">Allowed Domains</Label>
                <Textarea
                  id="domains"
                  value={domains}
                  onChange={(e) => setDomains(e.target.value)}
                  placeholder="example.com&#10;*.staging.example.com&#10;localhost"
                  rows={4}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  One domain per line. Use * for wildcard subdomains. Leave empty
                  to allow all domains.
                </p>
              </div>
            </TabsContent>

            {/* Appearance Tab */}
            <TabsContent value="appearance" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="primaryColor">Primary Color</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      type="color"
                      id="primaryColor"
                      value={config.theme.primaryColor}
                      onChange={(e) => updateTheme("primaryColor", e.target.value)}
                      className="w-12 h-10 p-1 cursor-pointer"
                    />
                    <Input
                      value={config.theme.primaryColor}
                      onChange={(e) => updateTheme("primaryColor", e.target.value)}
                      className="flex-1"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="backgroundColor">Background Color</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      type="color"
                      id="backgroundColor"
                      value={config.theme.backgroundColor}
                      onChange={(e) =>
                        updateTheme("backgroundColor", e.target.value)
                      }
                      className="w-12 h-10 p-1 cursor-pointer"
                    />
                    <Input
                      value={config.theme.backgroundColor}
                      onChange={(e) =>
                        updateTheme("backgroundColor", e.target.value)
                      }
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="position">Widget Position</Label>
                <Select
                  value={config.position}
                  onValueChange={(value) =>
                    updateConfig({
                      position: value as WidgetConfig["position"],
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bottom-right">Bottom Right</SelectItem>
                    <SelectItem value="bottom-left">Bottom Left</SelectItem>
                    <SelectItem value="top-right">Top Right</SelectItem>
                    <SelectItem value="top-left">Top Left</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="customCssClass">Custom CSS Class</Label>
                <Input
                  id="customCssClass"
                  value={config.customCssClass || ""}
                  onChange={(e) => updateConfig({ customCssClass: e.target.value })}
                  placeholder="my-custom-widget"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Add a custom CSS class to the widget container
                </p>
              </div>

              <div>
                <Label htmlFor="avatar">Avatar URL</Label>
                <Input
                  id="avatar"
                  value={config.avatar || ""}
                  onChange={(e) => updateConfig({ avatar: e.target.value })}
                  placeholder="https://example.com/avatar.png"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  URL to a custom avatar image (leave empty to use assistant emoji)
                </p>
              </div>
            </TabsContent>

            {/* Behavior Tab */}
            <TabsContent value="behavior" className="space-y-4 mt-4">
              <div>
                <Label htmlFor="headerTitle">Header Title</Label>
                <Input
                  id="headerTitle"
                  value={config.headerTitle || ""}
                  onChange={(e) => updateConfig({ headerTitle: e.target.value })}
                  placeholder="Chat with us"
                />
              </div>

              <div>
                <Label htmlFor="welcomeMessage">Welcome Message</Label>
                <Textarea
                  id="welcomeMessage"
                  value={config.welcomeMessage}
                  onChange={(e) => updateConfig({ welcomeMessage: e.target.value })}
                  placeholder="Hi! How can I help you today?"
                  rows={3}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  The first message shown when the chat opens
                </p>
              </div>

              <div>
                <Label htmlFor="placeholderText">Input Placeholder</Label>
                <Input
                  id="placeholderText"
                  value={config.placeholderText}
                  onChange={(e) => updateConfig({ placeholderText: e.target.value })}
                  placeholder="Type your message..."
                />
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !name || !assistantId}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingKey ? "Save Changes" : "Create Key"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
