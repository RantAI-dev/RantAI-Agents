"use client"

import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Brain } from "lucide-react"
import type { MemoryConfig } from "@/lib/types/assistant"

interface TabMemoryProps {
  memoryConfig: MemoryConfig
  onMemoryConfigChange: (config: MemoryConfig) => void
}

export function TabMemory({ memoryConfig, onMemoryConfigChange }: TabMemoryProps) {
  const update = (partial: Partial<MemoryConfig>) => {
    onMemoryConfigChange({ ...memoryConfig, ...partial })
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Memory</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Configure how the agent remembers context across conversations.
        </p>
      </div>

      {/* Master Toggle */}
      <div className="flex items-center gap-3 p-4 rounded-lg border">
        <Brain className="h-5 w-5 text-muted-foreground shrink-0" />
        <div className="flex-1">
          <Label htmlFor="memory-enabled" className="text-sm font-medium">
            Enable Memory
          </Label>
          <p className="text-xs text-muted-foreground">
            Allow the agent to remember information across conversations
          </p>
        </div>
        <Switch
          id="memory-enabled"
          checked={memoryConfig.enabled}
          onCheckedChange={(checked) => update({ enabled: checked })}
        />
      </div>

      {/* Memory Features */}
      {memoryConfig.enabled && (
        <div className="space-y-4 pl-1">
          {/* Working Memory */}
          <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
            <div className="flex-1">
              <Label className="text-sm font-medium text-muted-foreground">
                Working Memory
              </Label>
              <p className="text-xs text-muted-foreground">
                Short-term context within the current conversation (always active)
              </p>
            </div>
            <Switch checked disabled />
          </div>

          {/* Semantic Recall */}
          <div className="flex items-center gap-3 p-3 rounded-lg border">
            <div className="flex-1">
              <Label htmlFor="semantic-recall" className="text-sm font-medium">
                Semantic Recall
              </Label>
              <p className="text-xs text-muted-foreground">
                Retrieve relevant memories from past conversations
              </p>
            </div>
            <Switch
              id="semantic-recall"
              checked={memoryConfig.semanticRecall}
              onCheckedChange={(checked) => update({ semanticRecall: checked })}
            />
          </div>

          {/* Long-term Profile */}
          <div className="flex items-center gap-3 p-3 rounded-lg border">
            <div className="flex-1">
              <Label htmlFor="long-term" className="text-sm font-medium">
                Long-term Profile
              </Label>
              <p className="text-xs text-muted-foreground">
                Build and maintain a profile of the user over time
              </p>
            </div>
            <Switch
              id="long-term"
              checked={memoryConfig.longTermProfile}
              onCheckedChange={(checked) => update({ longTermProfile: checked })}
            />
          </div>

          {/* Memory Instructions */}
          <div className="space-y-2">
            <Label htmlFor="memory-instructions" className="text-sm font-medium">
              Memory Instructions
            </Label>
            <p className="text-xs text-muted-foreground">
              Guide what the agent should prioritize remembering.
            </p>
            <Textarea
              id="memory-instructions"
              value={memoryConfig.memoryInstructions || ""}
              onChange={(e) => update({ memoryInstructions: e.target.value })}
              placeholder="Remember the user's preferred language, key preferences, and any important context they share..."
              className="min-h-[120px]"
            />
          </div>
        </div>
      )}
    </div>
  )
}
