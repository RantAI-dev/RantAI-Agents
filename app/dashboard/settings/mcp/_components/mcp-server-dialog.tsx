"use client"

import { useState, useEffect, useMemo } from "react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useMcpServers, type McpServerItem, type EnvKeyDef } from "@/hooks/use-mcp-servers"
import { toast } from "sonner"
import { ExternalLink, Loader2 } from "@/lib/icons"

interface McpServerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editServer?: McpServerItem | null
}

export function McpServerDialog({
  open,
  onOpenChange,
  editServer,
}: McpServerDialogProps) {
  const { createServer, updateServer } = useMcpServers()
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [transport, setTransport] = useState<string>("streamable-http")
  const [url, setUrl] = useState("")
  const [headersJson, setHeadersJson] = useState("{}")
  // envValues maps env key names → user-entered values
  const [envValues, setEnvValues] = useState<Record<string, string>>({})

  const isBuiltIn = editServer?.isBuiltIn ?? false
  const envKeys: EnvKeyDef[] = useMemo(
    () => (editServer?.envKeys as EnvKeyDef[] | null) ?? [],
    [editServer]
  )
  const docsUrl = editServer?.docsUrl ?? null

  useEffect(() => {
    if (editServer) {
      setName(editServer.name)
      setDescription(editServer.description || "")
      setTransport(editServer.transport)
      setUrl(editServer.url || "")
      setHeadersJson("{}")
      // Initialize env values from envKeys (blank by default, user must re-enter)
      const initEnv: Record<string, string> = {}
      for (const ek of envKeys) {
        initEnv[ek.key] = ""
      }
      setEnvValues(initEnv)
    } else {
      setName("")
      setDescription("")
      setTransport("streamable-http")
      setUrl("")
      setHeadersJson("{}")
      setEnvValues({})
    }
  }, [editServer, envKeys, open])

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Name is required")
      return
    }

    if (!url.trim()) {
      toast.error("URL is required")
      return
    }

    // Build env from labeled fields
    let env: Record<string, string> | undefined
    const filledEnv: Record<string, string> = {}
    for (const [key, value] of Object.entries(envValues)) {
      if (value.trim()) {
        filledEnv[key] = value.trim()
      }
    }
    if (Object.keys(filledEnv).length > 0) env = filledEnv

    let headers: Record<string, string> | undefined
    try {
      const parsedHeaders = JSON.parse(headersJson)
      if (Object.keys(parsedHeaders).length > 0) headers = parsedHeaders
    } catch {
      toast.error("Invalid JSON for headers")
      return
    }

    // Determine configured status:
    // configured = true when envKeys is empty OR all env keys have values
    const needsEnv = envKeys.length > 0
    const allFilled = needsEnv
      ? envKeys.every((ek) => filledEnv[ek.key])
      : true
    const configured = allFilled

    setSaving(true)
    try {
      const data = {
        name: name.trim(),
        description: description.trim() || undefined,
        transport,
        url: url.trim(),
        env,
        headers,
        configured,
      }

      if (editServer) {
        await updateServer(editServer.id, data)
        toast.success("MCP server updated")
      } else {
        await createServer(data)
        toast.success("MCP server added")
      }
      onOpenChange(false)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save MCP server"
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>
            {editServer ? `Edit ${editServer.name}` : "Add MCP Server"}
          </DialogTitle>
          {docsUrl && (
            <div className="flex items-center gap-2 pt-1">
              <a
                href={docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" />
                Documentation
              </a>
            </div>
          )}
        </DialogHeader>

        <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="My MCP Server"
              value={name}
              onChange={(e) => setName(e.target.value)}
              readOnly={isBuiltIn}
              className={isBuiltIn ? "bg-muted" : ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              placeholder="Optional description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Transport</Label>
            <Select
              value={transport}
              onValueChange={setTransport}
              disabled={isBuiltIn}
            >
              <SelectTrigger className={isBuiltIn ? "bg-muted" : ""}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="streamable-http">
                  Streamable HTTP
                </SelectItem>
                <SelectItem value="sse">SSE (Server-Sent Events)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="url">Server URL</Label>
            <Input
              id="url"
              placeholder="https://mcp-server.example.com/mcp"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              readOnly={isBuiltIn}
              className={isBuiltIn ? "bg-muted" : ""}
            />
          </div>

          {/* Labeled env key fields (from envKeys) */}
          {envKeys.length > 0 && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">Configuration</Label>
              {envKeys.map((ek) => (
                <div key={ek.key} className="space-y-1">
                  <Label htmlFor={`env-${ek.key}`} className="text-xs">
                    {ek.label}
                  </Label>
                  <Input
                    id={`env-${ek.key}`}
                    type="password"
                    placeholder={ek.placeholder}
                    value={envValues[ek.key] || ""}
                    onChange={(e) =>
                      setEnvValues((prev) => ({
                        ...prev,
                        [ek.key]: e.target.value,
                      }))
                    }
                  />
                </div>
              ))}
            </div>
          )}

          {/* Raw headers field (for advanced users / non-built-in) */}
          {!isBuiltIn && (
            <div className="space-y-2">
              <Label htmlFor="headers">HTTP Headers (JSON)</Label>
              <Textarea
                id="headers"
                className="font-mono text-xs"
                value={headersJson}
                onChange={(e) => setHeadersJson(e.target.value)}
                rows={3}
                placeholder='{"Authorization": "Bearer ..."}'
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {editServer ? "Save Changes" : "Add Server"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
