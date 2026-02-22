"use client"

import { useState } from "react"
import { Shield, Plus, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { GuardRailsConfig } from "@/lib/types/assistant"

interface GuardRailsSettingsProps {
  config: GuardRailsConfig
  onChange: (config: GuardRailsConfig) => void
}

export function GuardRailsSettings({ config, onChange }: GuardRailsSettingsProps) {
  const [topicInput, setTopicInput] = useState("")

  const addTopic = () => {
    const topic = topicInput.trim()
    if (!topic) return
    const current = config.blockedTopics || []
    if (current.includes(topic)) return
    onChange({ ...config, blockedTopics: [...current, topic] })
    setTopicInput("")
  }

  const removeTopic = (topic: string) => {
    onChange({
      ...config,
      blockedTopics: (config.blockedTopics || []).filter((t) => t !== topic),
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      addTopic()
    }
  }

  return (
    <div className="p-6 max-w-3xl space-y-8">
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Guard Rails</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Configure safety rules and content restrictions for this agent.
        </p>
      </section>

      {/* Blocked Topics */}
      <section className="space-y-3">
        <Label>Blocked Topics</Label>
        <p className="text-xs text-muted-foreground">
          Topics the agent should never discuss. Press Enter to add.
        </p>
        <div className="flex gap-2">
          <Input
            value={topicInput}
            onChange={(e) => setTopicInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. competitor pricing, internal finances"
            className="flex-1"
          />
          <Button type="button" variant="outline" size="sm" onClick={addTopic}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        {(config.blockedTopics?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {config.blockedTopics!.map((topic) => (
              <Badge
                key={topic}
                variant="secondary"
                className="gap-1 pr-1"
              >
                {topic}
                <button
                  type="button"
                  onClick={() => removeTopic(topic)}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </section>

      {/* Safety Instructions */}
      <section className="space-y-3">
        <Label htmlFor="safety-instructions">Custom Safety Instructions</Label>
        <p className="text-xs text-muted-foreground">
          Additional safety rules appended to the system prompt.
        </p>
        <Textarea
          id="safety-instructions"
          value={config.safetyInstructions || ""}
          onChange={(e) =>
            onChange({ ...config, safetyInstructions: e.target.value })
          }
          placeholder="e.g. Never share personal information about employees. Always recommend consulting a professional for medical questions."
          rows={3}
        />
      </section>

      {/* Max Response Length */}
      <section className="space-y-3">
        <Label htmlFor="max-response-length">Max Response Length (characters)</Label>
        <p className="text-xs text-muted-foreground">
          Limit how long the agent&apos;s responses can be. Leave empty for no limit.
        </p>
        <Input
          id="max-response-length"
          type="number"
          min={0}
          step={100}
          value={config.maxResponseLength || ""}
          onChange={(e) =>
            onChange({
              ...config,
              maxResponseLength: e.target.value ? Number(e.target.value) : undefined,
            })
          }
          placeholder="e.g. 2000"
          className="w-48"
        />
      </section>

      {/* Require Citations */}
      <section className="space-y-3">
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="text-sm font-medium">Require Citations</p>
            <p className="text-xs text-muted-foreground">
              Force the agent to cite sources when making factual claims
            </p>
          </div>
          <Switch
            checked={config.requireCitations || false}
            onCheckedChange={(checked) =>
              onChange({ ...config, requireCitations: checked })
            }
          />
        </div>
      </section>
    </div>
  )
}
