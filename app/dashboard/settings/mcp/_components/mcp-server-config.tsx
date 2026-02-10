"use client"

import { useState } from "react"
import {
  Key,
  Plus,
  Loader2,
  Trash2,
  Pencil,
  Copy,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  Wrench,
  Server,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { useMcpApiKeys, type McpApiKeyItem } from "@/hooks/use-mcp-api-keys"
import { McpApiKeyDialog } from "./mcp-api-key-dialog"
import { maskMcpApiKey } from "@/lib/mcp/api-key"
import { toast } from "sonner"

export function McpServerConfig() {
  const { keys, isLoading, updateKey, deleteKey } = useMcpApiKeys()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingKey, setEditingKey] = useState<McpApiKeyItem | null>(null)
  const [deletingKey, setDeletingKey] = useState<string | null>(null)
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set())
  const [instructionsOpen, setInstructionsOpen] = useState(false)

  const endpoint =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/mcp`
      : "/api/mcp"

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await updateKey(id, { enabled })
      toast.success(enabled ? "Key enabled" : "Key disabled")
    } catch {
      toast.error("Failed to update key")
    }
  }

  const handleDelete = async () => {
    if (!deletingKey) return
    try {
      await deleteKey(deletingKey)
      toast.success("API key deleted")
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete key"
      )
    } finally {
      setDeletingKey(null)
    }
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copied to clipboard`)
  }

  const toggleReveal = (id: string) => {
    setRevealedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <div className="space-y-6">
      {/* Endpoint Info */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-medium">MCP Server Endpoint</h3>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <code className="flex-1 text-sm bg-muted px-3 py-2 rounded-md font-mono truncate">
              {endpoint}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(endpoint, "Endpoint URL")}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">Streamable HTTP</Badge>
            <span className="text-xs text-muted-foreground">
              Bearer token authentication
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Connection Instructions */}
      <Collapsible open={instructionsOpen} onOpenChange={setInstructionsOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-sm">Connection Instructions</h3>
                {instructionsOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-4">
              <div>
                <p className="text-sm font-medium mb-1">Claude Desktop</p>
                <p className="text-xs text-muted-foreground mb-2">
                  Add to your <code>claude_desktop_config.json</code>:
                </p>
                <div className="relative">
                  <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto">
{`{
  "mcpServers": {
    "rantai": {
      "url": "${endpoint}",
      "transport": "streamable-http",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}`}
                  </pre>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-1 right-1 h-6 w-6"
                    onClick={() =>
                      copyToClipboard(
                        JSON.stringify(
                          {
                            mcpServers: {
                              rantai: {
                                url: endpoint,
                                transport: "streamable-http",
                                headers: {
                                  Authorization: "Bearer YOUR_API_KEY",
                                },
                              },
                            },
                          },
                          null,
                          2
                        ),
                        "Config"
                      )
                    }
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium mb-1">Cursor / Other Clients</p>
                <p className="text-xs text-muted-foreground">
                  Use the endpoint URL above with Streamable HTTP transport and
                  set the <code>Authorization</code> header to{" "}
                  <code>Bearer YOUR_API_KEY</code>.
                </p>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* API Keys */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-sm">API Keys</h3>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Create Key
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : keys.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-8">
              <Key className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground mb-3">
                No API keys yet. Create one to allow external MCP clients to
                connect.
              </p>
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Create API Key
              </Button>
            </CardContent>
          </Card>
        ) : (
          keys.map((apiKey) => (
            <Card key={apiKey.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex items-center gap-3 min-w-0">
                  <Key className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <h4 className="text-sm font-medium truncate">
                      {apiKey.name}
                    </h4>
                    <div className="flex items-center gap-1 mt-0.5">
                      <code className="text-xs text-muted-foreground font-mono">
                        {revealedKeys.has(apiKey.id)
                          ? apiKey.key
                          : maskMcpApiKey(apiKey.key)}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() => toggleReveal(apiKey.id)}
                      >
                        {revealedKeys.has(apiKey.id) ? (
                          <EyeOff className="h-3 w-3" />
                        ) : (
                          <Eye className="h-3 w-3" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() =>
                          copyToClipboard(apiKey.key, "API key")
                        }
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setEditingKey(apiKey)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => setDeletingKey(apiKey.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  <Switch
                    checked={apiKey.enabled}
                    onCheckedChange={(checked) =>
                      handleToggle(apiKey.id, checked)
                    }
                  />
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Wrench className="h-3 w-3" />
                    {apiKey.exposedTools.length > 0
                      ? `${apiKey.exposedTools.length} tool${apiKey.exposedTools.length !== 1 ? "s" : ""}`
                      : "All tools"}
                  </span>
                  <span>
                    {apiKey.requestCount} request
                    {apiKey.requestCount !== 1 && "s"}
                  </span>
                  {apiKey.lastUsedAt && (
                    <span>
                      Last used{" "}
                      {new Date(apiKey.lastUsedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <McpApiKeyDialog
        open={dialogOpen || !!editingKey}
        onOpenChange={(open) => {
          if (!open) {
            setDialogOpen(false)
            setEditingKey(null)
          }
        }}
        editKey={editingKey}
      />

      <AlertDialog
        open={!!deletingKey}
        onOpenChange={(open) => !open && setDeletingKey(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete API Key</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently revoke this API key. Any external clients
              using it will lose access immediately. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
