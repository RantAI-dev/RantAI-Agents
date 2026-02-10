"use client"

import { useState, useEffect, useCallback } from "react"
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
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useTools } from "@/hooks/use-tools"
import { toast } from "sonner"
import { Loader2, Plus, Trash2 } from "lucide-react"

interface ParameterRow {
  name: string
  type: string
  required: boolean
  description: string
}

function parametersToRows(params: object): ParameterRow[] {
  const schema = params as {
    type?: string
    properties?: Record<string, { type?: string; description?: string }>
    required?: string[]
  }
  if (!schema.properties) return []
  const requiredSet = new Set(schema.required || [])
  return Object.entries(schema.properties).map(([name, prop]) => ({
    name,
    type: prop.type || "string",
    required: requiredSet.has(name),
    description: prop.description || "",
  }))
}

function rowsToParameters(rows: ParameterRow[]): object {
  const properties: Record<string, { type: string; description?: string }> = {}
  const required: string[] = []
  for (const row of rows) {
    if (!row.name.trim()) continue
    properties[row.name.trim()] = {
      type: row.type,
      ...(row.description.trim()
        ? { description: row.description.trim() }
        : {}),
    }
    if (row.required) {
      required.push(row.name.trim())
    }
  }
  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
  }
}

interface ToolDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editToolId?: string | null
}

export function ToolDialog({
  open,
  onOpenChange,
  editToolId,
}: ToolDialogProps) {
  const { tools, createTool, updateTool } = useTools()
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [description, setDescription] = useState("")
  const [parametersJson, setParametersJson] = useState(
    '{\n  "type": "object",\n  "properties": {}\n}'
  )
  const [paramRows, setParamRows] = useState<ParameterRow[]>([])
  const [paramTab, setParamTab] = useState("visual")

  const editingTool = editToolId
    ? tools.find((t) => t.id === editToolId)
    : null

  useEffect(() => {
    if (editingTool) {
      setName(editingTool.name)
      setDisplayName(editingTool.displayName)
      setDescription(editingTool.description)
      setParametersJson(JSON.stringify(editingTool.parameters, null, 2))
      setParamRows(parametersToRows(editingTool.parameters))
    } else {
      setName("")
      setDisplayName("")
      setDescription("")
      setParametersJson('{\n  "type": "object",\n  "properties": {}\n}')
      setParamRows([])
    }
  }, [editingTool, open])

  const syncToJson = useCallback(() => {
    const params = rowsToParameters(paramRows)
    setParametersJson(JSON.stringify(params, null, 2))
  }, [paramRows])

  const syncToVisual = useCallback(() => {
    try {
      const parsed = JSON.parse(parametersJson)
      setParamRows(parametersToRows(parsed))
    } catch {
      // Invalid JSON — don't sync
    }
  }, [parametersJson])

  const handleTabChange = (tab: string) => {
    if (tab === "json") {
      syncToJson()
    } else {
      syncToVisual()
    }
    setParamTab(tab)
  }

  const addRow = () => {
    setParamRows((prev) => [
      ...prev,
      { name: "", type: "string", required: false, description: "" },
    ])
  }

  const updateRow = (
    index: number,
    field: keyof ParameterRow,
    value: string | boolean
  ) => {
    setParamRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    )
  }

  const removeRow = (index: number) => {
    setParamRows((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async () => {
    if (!name.trim() || !displayName.trim() || !description.trim()) {
      toast.error("All fields are required")
      return
    }

    let parameters: object
    if (paramTab === "visual") {
      parameters = rowsToParameters(paramRows)
    } else {
      try {
        parameters = JSON.parse(parametersJson)
      } catch {
        toast.error("Invalid JSON for parameters")
        return
      }
    }

    setSaving(true)
    try {
      if (editToolId) {
        await updateTool(editToolId, {
          displayName,
          description,
          parameters,
        })
        toast.success("Tool updated")
      } else {
        await createTool({ name, displayName, description, parameters })
        toast.success("Tool created")
      }
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save tool")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>
            {editToolId ? "Edit Tool" : "Create Custom Tool"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4 max-h-[65vh] overflow-y-auto">
          <div className="space-y-2">
            <Label htmlFor="name">Machine Name</Label>
            <Input
              id="name"
              placeholder="my_custom_tool"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!!editToolId}
            />
            <p className="text-xs text-muted-foreground">
              Unique identifier, cannot be changed after creation
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="displayName">Display Name</Label>
            <Input
              id="displayName"
              placeholder="My Custom Tool"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Describe what this tool does. This is shown to the LLM."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Parameters</Label>
            <Tabs value={paramTab} onValueChange={handleTabChange}>
              <TabsList className="h-8">
                <TabsTrigger value="visual" className="text-xs">
                  Visual
                </TabsTrigger>
                <TabsTrigger value="json" className="text-xs">
                  JSON
                </TabsTrigger>
              </TabsList>

              <TabsContent value="visual" className="space-y-3 mt-3">
                {paramRows.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">
                    No parameters defined. Click below to add one.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {paramRows.map((row, index) => (
                      <div
                        key={index}
                        className="flex gap-2 items-start p-3 rounded-md border bg-muted/30"
                      >
                        <div className="flex-1 space-y-2">
                          <div className="flex gap-2">
                            <Input
                              placeholder="name"
                              value={row.name}
                              onChange={(e) =>
                                updateRow(index, "name", e.target.value)
                              }
                              className="h-8 text-sm font-mono"
                            />
                            <Select
                              value={row.type}
                              onValueChange={(v) =>
                                updateRow(index, "type", v)
                              }
                            >
                              <SelectTrigger className="h-8 w-[110px] text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="string">string</SelectItem>
                                <SelectItem value="number">number</SelectItem>
                                <SelectItem value="boolean">boolean</SelectItem>
                                <SelectItem value="array">array</SelectItem>
                                <SelectItem value="object">object</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <Input
                            placeholder="Description (optional)"
                            value={row.description}
                            onChange={(e) =>
                              updateRow(index, "description", e.target.value)
                            }
                            className="h-8 text-sm"
                          />
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id={`required-${index}`}
                              checked={row.required}
                              onCheckedChange={(checked) =>
                                updateRow(index, "required", !!checked)
                              }
                            />
                            <label
                              htmlFor={`required-${index}`}
                              className="text-xs text-muted-foreground cursor-pointer"
                            >
                              Required
                            </label>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-destructive"
                          onClick={() => removeRow(index)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addRow}
                  className="w-full"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Parameter
                </Button>
              </TabsContent>

              <TabsContent value="json" className="mt-3">
                <Textarea
                  className="font-mono text-xs"
                  value={parametersJson}
                  onChange={(e) => setParametersJson(e.target.value)}
                  rows={8}
                />
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {editToolId ? "Save Changes" : "Create Tool"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
