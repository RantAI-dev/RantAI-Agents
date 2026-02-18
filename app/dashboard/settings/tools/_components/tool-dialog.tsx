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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Separator } from "@/components/ui/separator"
import { useTools } from "@/hooks/use-tools"
import { toast } from "sonner"
import { Loader2, Plus, Trash2, ChevronDown, Globe } from "lucide-react"
import { cn } from "@/lib/utils"

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

  // Execution config state
  const [execConfigOpen, setExecConfigOpen] = useState(false)
  const [execUrl, setExecUrl] = useState("")
  const [execMethod, setExecMethod] = useState("POST")
  const [execAuthType, setExecAuthType] = useState<"none" | "api_key" | "bearer">("none")
  const [execAuthHeaderName, setExecAuthHeaderName] = useState("X-API-Key")
  const [execAuthValue, setExecAuthValue] = useState("")
  const [execTimeoutMs, setExecTimeoutMs] = useState(30000)
  const [execHeaders, setExecHeaders] = useState<Array<{ key: string; value: string }>>([])

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
      // Load execution config
      const ec = editingTool.executionConfig
      if (ec) {
        setExecUrl(ec.url || "")
        setExecMethod(ec.method || "POST")
        setExecAuthType((ec.authType as "none" | "api_key" | "bearer") || "none")
        setExecAuthHeaderName(ec.authHeaderName || "X-API-Key")
        setExecAuthValue(ec.authValue || "")
        setExecTimeoutMs(ec.timeoutMs || 30000)
        setExecHeaders(
          ec.headers
            ? Object.entries(ec.headers).map(([key, value]) => ({ key, value }))
            : []
        )
        setExecConfigOpen(true)
      } else {
        setExecUrl("")
        setExecMethod("POST")
        setExecAuthType("none")
        setExecAuthHeaderName("X-API-Key")
        setExecAuthValue("")
        setExecTimeoutMs(30000)
        setExecHeaders([])
      }
    } else {
      setName("")
      setDisplayName("")
      setDescription("")
      setParametersJson('{\n  "type": "object",\n  "properties": {}\n}')
      setParamRows([])
      setExecUrl("")
      setExecMethod("POST")
      setExecAuthType("none")
      setExecAuthHeaderName("X-API-Key")
      setExecAuthValue("")
      setExecTimeoutMs(30000)
      setExecHeaders([])
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

  const buildExecutionConfig = () => {
    if (!execUrl.trim()) return null
    const headers: Record<string, string> = {}
    for (const h of execHeaders) {
      if (h.key.trim()) headers[h.key.trim()] = h.value
    }
    return {
      url: execUrl.trim(),
      method: execMethod,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
      authType: execAuthType,
      ...(execAuthType === "api_key" ? { authHeaderName: execAuthHeaderName } : {}),
      ...(execAuthType !== "none" && execAuthValue ? { authValue: execAuthValue } : {}),
      timeoutMs: execTimeoutMs,
    }
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

    const executionConfig = buildExecutionConfig()

    setSaving(true)
    try {
      if (editToolId) {
        await updateTool(editToolId, {
          displayName,
          description,
          parameters,
          executionConfig,
        })
        toast.success("Tool updated")
      } else {
        await createTool({ name, displayName, description, parameters, executionConfig })
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

          <Separator />

          {/* Execution Config */}
          <Collapsible open={execConfigOpen} onOpenChange={setExecConfigOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="flex w-full justify-between px-0 h-auto font-medium hover:bg-transparent"
                type="button"
              >
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  <span>Execution Config (HTTP)</span>
                  {execUrl.trim() && (
                    <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {execMethod} {new URL(execUrl).hostname}
                    </span>
                  )}
                </div>
                <ChevronDown className={cn("h-4 w-4 transition-transform", execConfigOpen && "rotate-180")} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-3">
              <p className="text-xs text-muted-foreground">
                Configure the HTTP endpoint that this tool calls when invoked by the AI.
                Without this, the tool cannot execute.
              </p>

              <div className="space-y-1.5">
                <Label htmlFor="exec-url">Endpoint URL</Label>
                <Input
                  id="exec-url"
                  placeholder="https://api.example.com/my-tool"
                  value={execUrl}
                  onChange={(e) => setExecUrl(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>HTTP Method</Label>
                <Select value={execMethod} onValueChange={setExecMethod}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GET">GET</SelectItem>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="PUT">PUT</SelectItem>
                    <SelectItem value="PATCH">PATCH</SelectItem>
                    <SelectItem value="DELETE">DELETE</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Authentication</Label>
                <Select
                  value={execAuthType}
                  onValueChange={(v) => setExecAuthType(v as "none" | "api_key" | "bearer")}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="bearer">Bearer Token</SelectItem>
                    <SelectItem value="api_key">API Key</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {execAuthType === "api_key" && (
                <div className="space-y-1.5">
                  <Label>Header Name</Label>
                  <Input
                    placeholder="X-API-Key"
                    value={execAuthHeaderName}
                    onChange={(e) => setExecAuthHeaderName(e.target.value)}
                  />
                </div>
              )}

              {execAuthType !== "none" && (
                <div className="space-y-1.5">
                  <Label>{execAuthType === "bearer" ? "Token" : "API Key Value"}</Label>
                  <Input
                    type="password"
                    placeholder="Enter secret..."
                    value={execAuthValue}
                    onChange={(e) => setExecAuthValue(e.target.value)}
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Timeout (ms)</Label>
                <Input
                  type="number"
                  min={1000}
                  max={120000}
                  value={execTimeoutMs}
                  onChange={(e) => setExecTimeoutMs(Number(e.target.value) || 30000)}
                />
                <p className="text-xs text-muted-foreground">
                  Max wait time for a response. Default: 30000ms (30s).
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Custom Headers</Label>
                {execHeaders.map((header, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input
                      placeholder="Header name"
                      value={header.key}
                      onChange={(e) => {
                        const updated = [...execHeaders]
                        updated[i] = { ...updated[i], key: e.target.value }
                        setExecHeaders(updated)
                      }}
                      className="h-8 text-sm font-mono"
                    />
                    <Input
                      placeholder="Value"
                      value={header.value}
                      onChange={(e) => {
                        const updated = [...execHeaders]
                        updated[i] = { ...updated[i], value: e.target.value }
                        setExecHeaders(updated)
                      }}
                      className="h-8 text-sm"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-destructive"
                      onClick={() => setExecHeaders(execHeaders.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExecHeaders([...execHeaders, { key: "", value: "" }])}
                  className="w-full"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Header
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>
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
