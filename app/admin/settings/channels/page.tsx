"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { brand } from "@/lib/branding"

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

interface ChannelMode {
  value: string
  label: string
  description: string
}

interface ChannelMetaItem {
  name: string
  icon: typeof Globe
  description: string
  color: string
  fields: ChannelField[]
  hasModes: boolean
  modes?: ChannelMode[]
  fieldsByMode?: Record<string, ChannelField[]>
}

const channelMeta: Record<string, ChannelMetaItem> = {
  PORTAL: {
    name: "Agent Portal",
    icon: Globe,
    description: "Real-time web chat via WebSocket",
    color: "blue",
    fields: [], // No additional config needed
    hasModes: false,
  },
  SALESFORCE: {
    name: "Salesforce Messaging",
    icon: Cloud,
    description: "Handoff to Salesforce embedded chat widget for agent support",
    color: "sky",
    hasModes: false,
    fields: [
      { key: "orgId", label: "Organization ID", placeholder: "00Dfj00000II7jp" },
      { key: "deploymentName", label: "Deployment Developer Name", placeholder: brand.salesforceDeploymentName },
      { key: "siteUrl", label: "Embedded Service Site URL", placeholder: "https://xxx.my.site.com/ESWdeploymentname" },
      { key: "scrt2Url", label: "SCRT2 URL", placeholder: "https://xxx.salesforce-scrt.com" },
    ],
  },
  WHATSAPP: {
    name: "WhatsApp Business",
    icon: MessageCircle,
    description: "Send notifications to agents via WhatsApp",
    color: "green",
    hasModes: false,
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
    hasModes: false,
    fields: [
      { key: "smtpHost", label: "SMTP Host", placeholder: "smtp.gmail.com" },
      { key: "smtpPort", label: "SMTP Port", placeholder: "587" },
      { key: "smtpUser", label: "SMTP Username", placeholder: "your@email.com" },
      { key: "smtpPass", label: "SMTP Password", placeholder: "App password", type: "password" },
      { key: "fromEmail", label: "From Email", placeholder: brand.supportEmail },
      { key: "fromName", label: "From Name", placeholder: brand.supportEmailName },
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
        // Refresh to get updated data
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
        <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">
          Channel Configuration
        </h1>
        <p className="text-neutral-500 mt-1">
          Configure how customer conversations are routed to agents. The primary
          channel will be used when customers request to speak with an agent.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          {error}
        </div>
      )}

      <div className="grid gap-6">
        {channels.map((channel) => {
          const meta = channelMeta[channel.channel as keyof typeof channelMeta]
          if (!meta) return null

          const Icon = meta.icon
          const isSaving = saving === channel.channel
          const isSaved = saved === channel.channel

          return (
            <Card key={channel.channel} className={channel.enabled ? "" : "opacity-75"}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-lg ${
                        channel.enabled
                          ? `bg-${meta.color}-100`
                          : "bg-neutral-100"
                      }`}
                    >
                      <Icon
                        className={`h-5 w-5 ${
                          channel.enabled
                            ? `text-${meta.color}-600`
                            : "text-neutral-400"
                        }`}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">{meta.name}</CardTitle>
                        {channel.isPrimary && (
                          <Badge className="bg-amber-500">
                            <Zap className="h-3 w-3 mr-1" />
                            Primary
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-neutral-500">
                        {meta.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
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
                        Set as Primary
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
                        <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      {isSaved ? "Saved!" : "Save"}
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {channel.enabled && (meta.hasModes || meta.fields.length > 0) && (
                <CardContent>
                  {/* Mode selector for channels that support multiple modes */}
                  {meta.hasModes && meta.modes && (
                    <div className="mb-6">
                      <Label className="mb-3 block">Integration Mode</Label>
                      <div className="grid gap-3 md:grid-cols-2">
                        {meta.modes.map((mode: ChannelMode) => (
                          <button
                            key={mode.value}
                            type="button"
                            onClick={() =>
                              updateChannelConfig(channel.channel, "mode", mode.value)
                            }
                            className={`p-3 rounded-lg border text-left transition-all ${
                              (channel.config.mode || "web-to-case") === mode.value
                                ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
                                : "border-neutral-200 hover:border-neutral-300"
                            }`}
                          >
                            <div className="font-medium text-sm">{mode.label}</div>
                            <div className="text-xs text-neutral-500 mt-0.5">
                              {mode.description}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Dynamic fields based on mode (for Salesforce) or static fields */}
                  {(() => {
                    const currentMode = channel.config.mode || "web-to-case"
                    const fields: ChannelField[] = meta.hasModes && meta.fieldsByMode
                      ? meta.fieldsByMode[currentMode] || []
                      : meta.fields

                    if (fields.length === 0) return null

                    return (
                      <div className="grid gap-4 md:grid-cols-2">
                        {fields.map((field: ChannelField) => (
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
                    )
                  })()}
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>

      <Card className="bg-neutral-50 border-dashed">
        <CardContent className="pt-6">
          <h3 className="font-semibold text-neutral-700 mb-2">
            How Channel Routing Works
          </h3>
          <ul className="text-sm text-neutral-600 space-y-1">
            <li>
              - When a customer requests an agent, the system uses the{" "}
              <strong>primary channel</strong>
            </li>
            <li>
              - <strong>Portal:</strong> Customer enters the agent queue for
              real-time chat
            </li>
            <li>
              - <strong>Salesforce:</strong> Shows the Salesforce embedded chat
              widget for real-time agent support
            </li>
            <li>
              - <strong>WhatsApp:</strong> Sends notification to the configured
              agent phone number
            </li>
            <li>
              - <strong>Email:</strong> Sends confirmation email to the customer
              with a reference number
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
