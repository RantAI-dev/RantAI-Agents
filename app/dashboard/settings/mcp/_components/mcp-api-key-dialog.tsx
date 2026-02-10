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
import { Checkbox } from "@/components/ui/checkbox"
import { useMcpApiKeys, type McpApiKeyItem } from "@/hooks/use-mcp-api-keys"
import { useTools } from "@/hooks/use-tools"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

interface McpApiKeyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editKey?: McpApiKeyItem | null
}

export function McpApiKeyDialog({
  open,
  onOpenChange,
  editKey,
}: McpApiKeyDialogProps) {
  const { createKey, updateKey } = useMcpApiKeys()
  const { tools } = useTools()
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState("")
  const [selectedTools, setSelectedTools] = useState<string[]>([])

  // Filter to only show builtin tools
  const builtinTools = tools.filter((t) => t.category === "builtin")

  useEffect(() => {
    if (editKey) {
      setName(editKey.name)
      setSelectedTools(editKey.exposedTools)
    } else {
      setName("")
      setSelectedTools([])
    }
  }, [editKey, open])

  const toggleTool = (toolName: string) => {
    setSelectedTools((prev) =>
      prev.includes(toolName)
        ? prev.filter((t) => t !== toolName)
        : [...prev, toolName]
    )
  }

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Name is required")
      return
    }

    setSaving(true)
    try {
      if (editKey) {
        await updateKey(editKey.id, {
          name: name.trim(),
          exposedTools: selectedTools,
        })
        toast.success("API key updated")
      } else {
        await createKey({
          name: name.trim(),
          exposedTools: selectedTools,
        })
        toast.success("API key created")
      }
      onOpenChange(false)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save API key"
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {editKey ? "Edit API Key" : "Create MCP API Key"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="keyName">Name</Label>
            <Input
              id="keyName"
              placeholder="My API Key"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              A label to identify this key
            </p>
          </div>

          <div className="space-y-2">
            <Label>Exposed Tools</Label>
            <p className="text-xs text-muted-foreground">
              Select which tools this key can access. Leave empty to expose all
              built-in tools.
            </p>
            <div className="space-y-2 mt-2">
              {builtinTools.map((tool) => (
                <div
                  key={tool.name}
                  className="flex items-center space-x-2 rounded-md border p-3"
                >
                  <Checkbox
                    id={`tool-${tool.name}`}
                    checked={selectedTools.includes(tool.name)}
                    onCheckedChange={() => toggleTool(tool.name)}
                  />
                  <div className="flex-1 min-w-0">
                    <label
                      htmlFor={`tool-${tool.name}`}
                      className="text-sm font-medium cursor-pointer"
                    >
                      {tool.displayName}
                    </label>
                    <p className="text-xs text-muted-foreground truncate">
                      {tool.description}
                    </p>
                  </div>
                </div>
              ))}
              {builtinTools.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">
                  No built-in tools available. They will appear after the system
                  initializes.
                </p>
              )}
            </div>
            {selectedTools.length === 0 && builtinTools.length > 0 && (
              <p className="text-xs text-muted-foreground italic">
                No tools selected — all built-in tools will be exposed.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {editKey ? "Save Changes" : "Create Key"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
