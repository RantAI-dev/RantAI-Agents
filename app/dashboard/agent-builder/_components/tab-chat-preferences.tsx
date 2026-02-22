"use client"

import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import { MessageSquareText } from "lucide-react"
import type { ChatConfig } from "@/lib/types/assistant"

interface TabChatPreferencesProps {
  chatConfig: ChatConfig
  onChatConfigChange: (config: ChatConfig) => void
}

const DEFAULT_CHAT_CONFIG: ChatConfig = {
  autoCreateTopic: true,
  messageThreshold: 2,
  limitHistory: true,
  historyCount: 20,
  autoSummary: true,
  autoScroll: false,
}

export function TabChatPreferences({
  chatConfig,
  onChatConfigChange,
}: TabChatPreferencesProps) {
  const config = { ...DEFAULT_CHAT_CONFIG, ...chatConfig }

  const update = (partial: Partial<ChatConfig>) => {
    onChatConfigChange({ ...config, ...partial })
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Chat Preferences</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Configure conversation behavior for this agent.
        </p>
      </div>

      {/* Auto Create Topic */}
      <div className="space-y-3 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageSquareText className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <Label className="text-sm font-medium">Auto Create Topic</Label>
              <p className="text-xs text-muted-foreground">
                Automatically create a topic when the message count exceeds the threshold
              </p>
            </div>
          </div>
          <Switch
            checked={config.autoCreateTopic}
            onCheckedChange={(checked) => update({ autoCreateTopic: checked })}
          />
        </div>

        {config.autoCreateTopic && (
          <div className="pl-8 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Message Threshold</Label>
              <span className="text-sm font-medium w-10 text-right">{config.messageThreshold}</span>
            </div>
            <Slider
              value={[config.messageThreshold ?? 2]}
              onValueChange={([v]) => update({ messageThreshold: v })}
              min={1}
              max={20}
              step={1}
            />
          </div>
        )}
      </div>

      {/* Limit History Message Count */}
      <div className="space-y-3 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">Limit History Message Count</Label>
            <p className="text-xs text-muted-foreground">
              Cap the number of historical messages sent with each request to save tokens
            </p>
          </div>
          <Switch
            checked={config.limitHistory}
            onCheckedChange={(checked) => update({ limitHistory: checked })}
          />
        </div>

        {config.limitHistory && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Attached History Message Count</Label>
              <span className="text-sm font-medium w-10 text-right">{config.historyCount}</span>
            </div>
            <Slider
              value={[config.historyCount ?? 20]}
              onValueChange={([v]) => update({ historyCount: v })}
              min={1}
              max={50}
              step={1}
            />
            <p className="text-[10px] text-muted-foreground">
              Number of historical messages carried with each request
            </p>
          </div>
        )}
      </div>

      {/* Enable Automatic Summary */}
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div>
          <Label className="text-sm font-medium">Enable Automatic Summary of Chat History</Label>
          <p className="text-xs text-muted-foreground">
            Automatically summarize long conversation history to maintain context within token limits
          </p>
        </div>
        <Switch
          checked={config.autoSummary}
          onCheckedChange={(checked) => update({ autoSummary: checked })}
        />
      </div>

      {/* Auto-scroll During AI Response */}
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div>
          <Label className="text-sm font-medium">Auto-scroll During AI Response</Label>
          <p className="text-xs text-muted-foreground">
            Override the global auto-scroll setting for this agent
          </p>
        </div>
        <Switch
          checked={config.autoScroll}
          onCheckedChange={(checked) => update({ autoScroll: checked })}
        />
      </div>
    </div>
  )
}
