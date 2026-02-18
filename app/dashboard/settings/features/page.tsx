"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Headphones,
  Globe,
  Cloud,
  MessageCircle,
  Mail,
  Zap,
  Save,
  Loader2,
  CheckCircle,
  AlertCircle,
  ChevronDown,
  Settings2,
} from "lucide-react"
import { brand } from "@/lib/branding"

/* ── Feature types ─────────────────────────────────────────── */

interface FeatureConfig {
  id: string | null
  feature: string
  enabled: boolean
  config: Record<string, string>
}

const featureMeta: Record<
  string,
  { name: string; icon: typeof Headphones; description: string }
> = {
  AGENT: {
    name: "Agent Portal",
    icon: Headphones,
    description:
      "Customer support queue and live chat with agents. When disabled, the Agent menu item will be hidden from the navigation.",
  },
}

/* ── Channel types ─────────────────────────────────────────── */

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
  fields: ChannelField[]
}

const channelMeta: Record<string, ChannelMetaItem> = {
  PORTAL: {
    name: "Agent Portal",
    icon: Globe,
    description: "Real-time web chat via WebSocket",
    fields: [],
  },
  SALESFORCE: {
    name: "Salesforce Messaging",
    icon: Cloud,
    description: "Handoff to Salesforce embedded chat widget",
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

/* ── Page ───────────────────────────────────────────────────── */

export default function FeaturesSettingsPage() {
  // Feature state
  const [features, setFeatures] = useState<FeatureConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Channel state
  const [channels, setChannels] = useState<ChannelConfig[]>([])
  const [channelsLoading, setChannelsLoading] = useState(true)
  const [channelSaving, setChannelSaving] = useState<string | null>(null)
  const [channelSaved, setChannelSaved] = useState<string | null>(null)
  const [channelError, setChannelError] = useState<string | null>(null)
  const [channelsOpen, setChannelsOpen] = useState(false)

  useEffect(() => {
    fetchFeatures()
    fetchChannels()
  }, [])

  /* ── Feature API ── */

  async function fetchFeatures() {
    try {
      const response = await fetch("/api/admin/features")
      if (response.ok) {
        const data = await response.json()
        setFeatures(data)
      }
    } catch (err) {
      console.error("Failed to fetch features:", err)
      setError("Failed to load feature configurations")
    } finally {
      setLoading(false)
    }
  }

  async function saveFeature(feature: FeatureConfig) {
    setSaving(feature.feature)
    setError(null)
    setSaved(null)

    try {
      const response = await fetch("/api/admin/features", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(feature),
      })

      if (response.ok) {
        setSaved(feature.feature)
        setTimeout(() => setSaved(null), 3000)
        fetchFeatures()
      } else {
        const data = await response.json()
        setError(data.error || "Failed to save")
      }
    } catch (err) {
      console.error("Failed to save feature:", err)
      setError("Failed to save feature configuration")
    } finally {
      setSaving(null)
    }
  }

  function updateFeature(featureName: string, updates: Partial<FeatureConfig>) {
    setFeatures((prev) =>
      prev.map((f) =>
        f.feature === featureName ? { ...f, ...updates } : f
      )
    )
  }

  /* ── Channel API ── */

  async function fetchChannels() {
    try {
      const response = await fetch("/api/admin/channels")
      if (response.ok) {
        const data = await response.json()
        setChannels(data)
      }
    } catch (err) {
      console.error("Failed to fetch channels:", err)
      setChannelError("Failed to load channel configurations")
    } finally {
      setChannelsLoading(false)
    }
  }

  async function saveChannel(channel: ChannelConfig) {
    setChannelSaving(channel.channel)
    setChannelError(null)
    setChannelSaved(null)

    try {
      const response = await fetch("/api/admin/channels", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(channel),
      })

      if (response.ok) {
        setChannelSaved(channel.channel)
        setTimeout(() => setChannelSaved(null), 3000)
        fetchChannels()
      } else {
        const data = await response.json()
        setChannelError(data.error || "Failed to save")
      }
    } catch (err) {
      console.error("Failed to save channel:", err)
      setChannelError("Failed to save channel configuration")
    } finally {
      setChannelSaving(null)
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

  /* ── Render ── */

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const agentFeature = features.find((f) => f.feature === "AGENT")

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Feature Configuration</h2>
        <p className="text-sm text-muted-foreground">
          Enable or disable application capabilities. Disabled features will be
          hidden from the navigation.
        </p>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          {error}
        </div>
      )}

      <div className="grid gap-4">
        {features.map((feature) => {
          const meta = featureMeta[feature.feature]
          if (!meta) return null

          const Icon = meta.icon
          const isSaving = saving === feature.feature
          const isSaved = saved === feature.feature

          return (
            <Card key={feature.feature}>
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-muted shrink-0">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-base">{meta.name}</CardTitle>
                      <CardDescription>{meta.description}</CardDescription>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="flex items-center gap-2">
                      <Label
                        htmlFor={`${feature.feature}-enabled`}
                        className="text-sm"
                      >
                        Enabled
                      </Label>
                      <Switch
                        id={`${feature.feature}-enabled`}
                        checked={feature.enabled}
                        onCheckedChange={(checked) =>
                          updateFeature(feature.feature, { enabled: checked })
                        }
                      />
                    </div>

                    <Button
                      onClick={() => saveFeature(feature)}
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

              {/* Channel settings collapsible — only for AGENT feature when enabled */}
              {feature.feature === "AGENT" && feature.enabled && (
                <CardContent className="pt-0">
                  <Collapsible open={channelsOpen} onOpenChange={setChannelsOpen}>
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-between"
                      >
                        <span className="flex items-center gap-2">
                          <Settings2 className="h-4 w-4" />
                          Configure Channels
                        </span>
                        <ChevronDown
                          className={`h-4 w-4 transition-transform duration-200 ${
                            channelsOpen ? "rotate-180" : ""
                          }`}
                        />
                      </Button>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <div className="mt-4 space-y-4">
                        {channelError && (
                          <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg flex items-center gap-2 text-sm">
                            <AlertCircle className="h-4 w-4" />
                            {channelError}
                          </div>
                        )}

                        {channelsLoading ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                          </div>
                        ) : (
                          <>
                            {channels.map((channel) => {
                              const chMeta = channelMeta[channel.channel]
                              if (!chMeta) return null

                              const ChIcon = chMeta.icon
                              const isChSaving = channelSaving === channel.channel
                              const isChSaved = channelSaved === channel.channel

                              return (
                                <Card
                                  key={channel.channel}
                                  className={`border-dashed ${channel.enabled ? "" : "opacity-60"}`}
                                >
                                  <CardHeader className="py-3 px-4">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-3">
                                        <ChIcon className="h-4 w-4 text-muted-foreground" />
                                        <div>
                                          <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium">
                                              {chMeta.name}
                                            </span>
                                            {channel.isPrimary && (
                                              <Badge className="bg-chart-1 text-white text-[10px] px-1.5 py-0">
                                                <Zap className="h-3 w-3 mr-0.5" />
                                                Primary
                                              </Badge>
                                            )}
                                          </div>
                                          <p className="text-xs text-muted-foreground">
                                            {chMeta.description}
                                          </p>
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-2">
                                        {channel.channel !== "PORTAL" && (
                                          <Switch
                                            checked={channel.enabled}
                                            onCheckedChange={(checked) =>
                                              updateChannel(channel.channel, {
                                                enabled: checked,
                                              })
                                            }
                                          />
                                        )}

                                        {channel.enabled &&
                                          !channel.isPrimary && (
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="text-xs h-7"
                                              onClick={() =>
                                                setPrimary(channel.channel)
                                              }
                                            >
                                              Set Primary
                                            </Button>
                                          )}

                                        <Button
                                          onClick={() => saveChannel(channel)}
                                          disabled={isChSaving}
                                          variant="ghost"
                                          size="sm"
                                          className="h-7"
                                        >
                                          {isChSaving ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                          ) : isChSaved ? (
                                            <CheckCircle className="h-3.5 w-3.5 text-chart-2" />
                                          ) : (
                                            <Save className="h-3.5 w-3.5" />
                                          )}
                                        </Button>
                                      </div>
                                    </div>
                                  </CardHeader>

                                  {channel.enabled && chMeta.fields.length > 0 && (
                                    <CardContent className="px-4 pb-3 pt-0">
                                      <div className="grid gap-3 md:grid-cols-2">
                                        {chMeta.fields.map((field) => (
                                          <div
                                            key={field.key}
                                            className="space-y-1"
                                          >
                                            <Label
                                              htmlFor={`${channel.channel}-${field.key}`}
                                              className="text-xs"
                                            >
                                              {field.label}
                                            </Label>
                                            <Input
                                              id={`${channel.channel}-${field.key}`}
                                              type={field.type || "text"}
                                              placeholder={field.placeholder}
                                              value={
                                                channel.config[field.key] || ""
                                              }
                                              onChange={(e) =>
                                                updateChannelConfig(
                                                  channel.channel,
                                                  field.key,
                                                  e.target.value
                                                )
                                              }
                                              className="h-8 text-sm"
                                            />
                                          </div>
                                        ))}
                                      </div>
                                    </CardContent>
                                  )}
                                </Card>
                              )
                            })}

                            <div className="rounded-lg bg-muted/50 border border-dashed px-4 py-3">
                              <p className="text-xs font-medium mb-1">
                                How Channel Routing Works
                              </p>
                              <ul className="text-xs text-muted-foreground space-y-0.5">
                                <li>
                                  • When a customer requests an agent, the system
                                  uses the <strong>primary channel</strong>
                                </li>
                                <li>
                                  • <strong>Portal:</strong> Customer enters the
                                  agent queue for real-time chat
                                </li>
                                <li>
                                  • <strong>Salesforce:</strong> Shows the embedded
                                  chat widget for agent support
                                </li>
                                <li>
                                  • <strong>WhatsApp:</strong> Sends notification
                                  to the configured agent
                                </li>
                                <li>
                                  • <strong>Email:</strong> Sends confirmation
                                  email to the customer
                                </li>
                              </ul>
                            </div>
                          </>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>

      <Card className="bg-muted/50 border-dashed">
        <CardContent>
          <p className="text-sm text-muted-foreground">
            <strong>Note:</strong> Changes to feature settings may require you
            to refresh your browser to see the updated navigation.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
