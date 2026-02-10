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
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { useMcpServers, type McpServerItem } from "@/hooks/use-mcp-servers"
import type { McpServerTemplate } from "@/lib/mcp/templates"
import { toast } from "sonner"
import { ExternalLink, Loader2 } from "lucide-react"

interface McpServerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editServer?: McpServerItem | null
  template?: McpServerTemplate | null
}

export function McpServerDialog({
  open,
  onOpenChange,
  editServer,
  template,
}: McpServerDialogProps) {
  const { createServer, updateServer } = useMcpServers()
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [transport, setTransport] = useState<string>("sse")
  const [url, setUrl] = useState("")
  const [command, setCommand] = useState("")
  const [args, setArgs] = useState("")
  const [envJson, setEnvJson] = useState("{}")
  const [headersJson, setHeadersJson] = useState("{}")

  useEffect(() => {
    if (editServer) {
      setName(editServer.name)
      setDescription(editServer.description || "")
      setTransport(editServer.transport)
      setUrl(editServer.url || "")
      setCommand(editServer.command || "")
      setArgs(editServer.args?.join(" ") || "")
      setEnvJson("{}")
      setHeadersJson("{}")
    } else if (template) {
      setName(template.name)
      setDescription(template.description)
      setTransport(template.transport)
      setUrl(template.url || "")
      setCommand(template.command || "")
      setArgs(template.args?.join(" ") || "")
      // Build env JSON from template envKeys
      if (template.envKeys && template.envKeys.length > 0) {
        const envObj: Record<string, string> = {}
        for (const ek of template.envKeys) {
          envObj[ek.key] = ""
        }
        setEnvJson(JSON.stringify(envObj, null, 2))
      } else {
        setEnvJson("{}")
      }
      setHeadersJson("{}")
    } else {
      setName("")
      setDescription("")
      setTransport("sse")
      setUrl("")
      setCommand("")
      setArgs("")
      setEnvJson("{}")
      setHeadersJson("{}")
    }
  }, [editServer, template, open])

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Name is required")
      return
    }

    if (transport === "stdio" && !command.trim()) {
      toast.error("Command is required for stdio transport")
      return
    }

    if ((transport === "sse" || transport === "streamable-http") && !url.trim()) {
      toast.error("URL is required for SSE/HTTP transport")
      return
    }

    let env: Record<string, string> | undefined
    let headers: Record<string, string> | undefined

    try {
      const parsedEnv = JSON.parse(envJson)
      if (Object.keys(parsedEnv).length > 0) env = parsedEnv
    } catch {
      toast.error("Invalid JSON for environment variables")
      return
    }

    try {
      const parsedHeaders = JSON.parse(headersJson)
      if (Object.keys(parsedHeaders).length > 0) headers = parsedHeaders
    } catch {
      toast.error("Invalid JSON for headers")
      return
    }

    setSaving(true)
    try {
      const data = {
        name: name.trim(),
        description: description.trim() || undefined,
        transport,
        url: url.trim() || undefined,
        command: command.trim() || undefined,
        args: args.trim() ? args.trim().split(/\s+/) : undefined,
        env,
        headers,
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

  const isRemote = transport === "sse" || transport === "streamable-http"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>
            {editServer
              ? "Edit MCP Server"
              : template
                ? `Add ${template.name} Server`
                : "Add MCP Server"}
          </DialogTitle>
          {template && (
            <div className="flex items-center gap-2 pt-1">
              <Badge variant="secondary">{template.tags[0]}</Badge>
              {template.docsUrl && (
                <a
                  href={template.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="h-3 w-3" />
                  Documentation
                </a>
              )}
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
            <Select value={transport} onValueChange={setTransport}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sse">SSE (Server-Sent Events)</SelectItem>
                <SelectItem value="streamable-http">
                  Streamable HTTP
                </SelectItem>
                <SelectItem value="stdio">Stdio (Local Process)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isRemote && (
            <div className="space-y-2">
              <Label htmlFor="url">Server URL</Label>
              <Input
                id="url"
                placeholder="https://mcp-server.example.com/sse"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
          )}

          {transport === "stdio" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="command">Command</Label>
                <Input
                  id="command"
                  placeholder="npx"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="args">Arguments (space-separated)</Label>
                <Input
                  id="args"
                  placeholder="-y @modelcontextprotocol/server-filesystem /tmp"
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="env">
                  Environment Variables (JSON)
                </Label>
                <Textarea
                  id="env"
                  className="font-mono text-xs"
                  value={envJson}
                  onChange={(e) => setEnvJson(e.target.value)}
                  rows={3}
                  placeholder='{"API_KEY": "..."}'
                />
                {template?.envKeys && template.envKeys.length > 0 && (
                  <div className="space-y-1">
                    {template.envKeys.map((ek) => (
                      <p key={ek.key} className="text-xs text-muted-foreground">
                        <code className="bg-muted px-1 rounded">{ek.key}</code>{" "}
                        — {ek.label}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {isRemote && (
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
