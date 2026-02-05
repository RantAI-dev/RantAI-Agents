"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Globe,
  Cloud,
  MessageCircle,
  Mail,
  Zap,
  Save,
  Loader2,
  CheckCircle,
  AlertCircle,
} from "lucide-react"

interface ChannelConfig {
  id: string | null
  channel: string
  enabled: boolean
  isPrimary: boolean
  config: Record<string, string>
}

interface ChannelField {
  key: string
  label: string
  placeholder: string
  type?: string
}

interface ChannelMetaItem {
  name: string
  icon: typeof Globe
  description: string
  color: string
  fields: ChannelField[]
}

const channelMeta: Record<string, ChannelMetaItem> = {
  PORTAL: {
    name: "Agent Portal",
    icon: Globe,
    description: "Real-time web chat via WebSocket",
    color: "blue",
    fields: [],
  },
  SALESFORCE: {
    name: "Salesforce Messaging",
    icon: Cloud,
    description: "Handoff to Salesforce embedded chat widget",
    color: "sky",
    fields: [
      { key: "orgId", label: "Organization ID", placeholder: "00Dfj00000II7jp" },
      { key: "deploymentName", label: "Deployment Developer Name", placeholder: "rantai_chat" },
      { key: "siteUrl", label: "Embedded Service Site URL", placeholder: "https://xxx.my.site.com/ESWdeploymentname" },
      { key: "scrt2Url", label: "SCRT2 URL", placeholder: "https://xxx.salesforce-scrt.com" },
    ],
  },
  WHATSAPP: {
    name: "WhatsApp Business",
    icon: MessageCircle,
    description: "Send notifications to agents via WhatsApp",
    color: "green",
    fields: [
      { key: "phoneNumberId", label: "Phone Number ID", placeholder: "From Meta Business" },
      { key: "accessToken", label: "Access Token", placeholder: "Meta API token", type: "password" },
      { key: "agentPhoneNumber", label: "Agent Phone Number", placeholder: "+1234567890" },
      { key: "templateName", label: "Template Name", placeholder: "customer_inquiry (optional)" },
    ],
  },
  EMAIL: {
    name: "Email",
    icon: Mail,
    description: "Send confirmation emails to customers",
    color: "orange",
    fields: [
      { key: "smtpHost", label: "SMTP Host", placeholder: "smtp.gmail.com" },
      { key: "smtpPort", label: "SMTP Port", placeholder: "587" },
      { key: "smtpUser", label: "SMTP Username", placeholder: "your@email.com" },
      { key: "smtpPass", label: "SMTP Password", placeholder: "App password", type: "password" },
      { key: "fromEmail", label: "From Email", placeholder: "support@rantai.com" },
      { key: "fromName", label: "From Name", placeholder: "RantAI Support" },
    ],
  },
}

export default function ChannelSettingsPage() {
  const [channels, setChannels] = useState<ChannelConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchChannels()
  }, [])

  async function fetchChannels() {
    try {
      const response = await fetch("/api/admin/channels")
      if (response.ok) {
        const data = await response.json()
        setChannels(data)
      }
    } catch (err) {
      console.error("Failed to fetch channels:", err)
      setError("Failed to load channel configurations")
    } finally {
      setLoading(false)
    }
  }

  async function saveChannel(channel: ChannelConfig) {
    setSaving(channel.channel)
    setError(null)
    setSaved(null)

    try {
      const response = await fetch("/api/admin/channels", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(channel),
      })

      if (response.ok) {
        setSaved(channel.channel)
        setTimeout(() => setSaved(null), 3000)
        fetchChannels()
      } else {
        const data = await response.json()
        setError(data.error || "Failed to save")
      }
    } catch (err) {
      console.error("Failed to save channel:", err)
      setError("Failed to save channel configuration")
    } finally {
      setSaving(null)
    }
  }

  function updateChannel(channelName: string, updates: Partial<ChannelConfig>) {
    setChannels((prev) =>
      prev.map((c) =>
        c.channel === channelName ? { ...c, ...updates } : c
      )
    )
  }

  function updateChannelConfig(channelName: string, key: string, value: string) {
    setChannels((prev) =>
      prev.map((c) =>
        c.channel === channelName
          ? { ...c, config: { ...c.config, [key]: value } }
          : c
      )
    )
  }

  async function setPrimary(channelName: string) {
    const channel = channels.find((c) => c.channel === channelName)
    if (!channel || !channel.enabled) return
    await saveChannel({ ...channel, isPrimary: true })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Channel Configuration</h2>
        <p className="text-sm text-muted-foreground">
          Configure how customer conversations are routed to agents.
        </p>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          {error}
        </div>
      )}

      <div className="space-y-4">
        {channels.map((channel) => {
          const meta = channelMeta[channel.channel]
          if (!meta) return null

          const Icon = meta.icon
          const isSaving = saving === channel.channel
          const isSaved = saved === channel.channel

          return (
            <Card key={channel.channel} className={channel.enabled ? "" : "opacity-75"}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-muted">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">{meta.name}</CardTitle>
                        {channel.isPrimary && (
                          <Badge className="bg-chart-1 text-white">
                            <Zap className="h-3 w-3 mr-1" />
                            Primary
                          </Badge>
                        )}
                      </div>
                      <CardDescription>{meta.description}</CardDescription>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {channel.channel !== "PORTAL" && (
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`${channel.channel}-enabled`} className="text-sm">
                          Enabled
                        </Label>
                        <Switch
                          id={`${channel.channel}-enabled`}
                          checked={channel.enabled}
                          onCheckedChange={(checked) =>
                            updateChannel(channel.channel, { enabled: checked })
                          }
                        />
                      </div>
                    )}

                    {channel.enabled && !channel.isPrimary && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPrimary(channel.channel)}
                      >
                        Set Primary
                      </Button>
                    )}

                    <Button
                      onClick={() => saveChannel(channel)}
                      disabled={isSaving}
                      size="sm"
                    >
                      {isSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : isSaved ? (
                        <CheckCircle className="h-4 w-4 mr-2 text-chart-2" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      {isSaved ? "Saved!" : "Save"}
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {channel.enabled && meta.fields.length > 0 && (
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    {meta.fields.map((field) => (
                      <div key={field.key} className="space-y-2">
                        <Label htmlFor={`${channel.channel}-${field.key}`}>
                          {field.label}
                        </Label>
                        <Input
                          id={`${channel.channel}-${field.key}`}
                          type={field.type || "text"}
                          placeholder={field.placeholder}
                          value={channel.config[field.key] || ""}
                          onChange={(e) =>
                            updateChannelConfig(
                              channel.channel,
                              field.key,
                              e.target.value
                            )
                          }
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>

      <Card className="bg-muted/50 border-dashed">
        <CardContent>
          <h3 className="font-semibold mb-2">How Channel Routing Works</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• When a customer requests an agent, the system uses the <strong>primary channel</strong></li>
            <li>• <strong>Portal:</strong> Customer enters the agent queue for real-time chat</li>
            <li>• <strong>Salesforce:</strong> Shows the embedded chat widget for agent support</li>
            <li>• <strong>WhatsApp:</strong> Sends notification to the configured agent</li>
            <li>• <strong>Email:</strong> Sends confirmation email to the customer</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
