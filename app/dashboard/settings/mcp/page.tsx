"use client"

import { useState } from "react"
import {
  Plug,
  Plus,
  Loader2,
  Trash2,
  Pencil,
  RefreshCw,
  Wifi,
  WifiOff,
  Globe,
  ChevronDown,
  ChevronRight,
  Wrench,
  Store,
  AlertTriangle,
  Settings2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import { useMcpServers, type McpServerItem } from "@/hooks/use-mcp-servers"
import { useOrgFetch } from "@/hooks/use-organization"
import { DynamicIcon } from "@/components/ui/dynamic-icon"
import { McpServerDialog } from "./_components/mcp-server-dialog"
import { McpServerConfig } from "./_components/mcp-server-config"
import { toast } from "sonner"
import Link from "next/link"

export default function McpSettingsPage() {
  const { servers, isLoading, updateServer, deleteServer, discoverTools } =
    useMcpServers()
  const orgFetch = useOrgFetch()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingServer, setEditingServer] = useState<McpServerItem | null>(null)
  const [deletingServer, setDeletingServer] = useState<string | null>(null)
  const [discoveringServer, setDiscoveringServer] = useState<string | null>(null)
  const [expandedServer, setExpandedServer] = useState<string | null>(null)
  const [serverTools, setServerTools] = useState<
    Record<string, Array<{ id: string; name: string; displayName: string; description: string }>>
  >({})
  const [activeTab, setActiveTab] = useState("clients")

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await updateServer(id, { enabled })
      toast.success(enabled ? "Server enabled" : "Server disabled")
    } catch {
      toast.error("Failed to update server")
    }
  }

  const handleDelete = async () => {
    if (!deletingServer) return
    try {
      await deleteServer(deletingServer)
      toast.success("MCP server deleted")
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete server"
      )
    } finally {
      setDeletingServer(null)
    }
  }

  const handleDiscover = async (id: string) => {
    setDiscoveringServer(id)
    try {
      const result = await discoverTools(id)
      setServerTools((prev) => ({ ...prev, [id]: result.tools }))
      setExpandedServer(id)
      toast.success(`Discovered ${result.toolCount} tool(s)`)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to discover tools"
      )
    } finally {
      setDiscoveringServer(null)
    }
  }

  const handleExpand = async (id: string) => {
    if (expandedServer === id) {
      setExpandedServer(null)
      return
    }
    setExpandedServer(id)
    if (!serverTools[id]) {
      try {
        const res = await orgFetch(`/api/dashboard/mcp-servers/${id}`)
        if (res.ok) {
          const data = await res.json()
          setServerTools((prev) => ({ ...prev, [id]: data.tools }))
        }
      } catch {
        // Silently fail
      }
    }
  }

  const transportBadge = (transport: string) => {
    switch (transport) {
      case "sse":
        return (
          <Badge variant="outline">
            <Globe className="h-3 w-3 mr-1" />
            SSE
          </Badge>
        )
      case "streamable-http":
        return (
          <Badge variant="outline">
            <Globe className="h-3 w-3 mr-1" />
            HTTP
          </Badge>
        )
      default:
        return <Badge variant="outline">{transport}</Badge>
    }
  }

  const statusIndicator = (server: McpServerItem) => {
    if (!server.configured) {
      return (
        <Badge variant="outline" className="text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-800">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Needs Configuration
        </Badge>
      )
    }
    if (server.lastError) {
      return (
        <span className="flex items-center gap-1 text-xs text-destructive">
          <WifiOff className="h-3 w-3" />
          Error
        </span>
      )
    }
    if (server.lastConnectedAt) {
      return (
        <span className="flex items-center gap-1 text-xs text-green-600">
          <Wifi className="h-3 w-3" />
          Connected
        </span>
      )
    }
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <WifiOff className="h-3 w-3" />
        Not connected
      </span>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">MCP</h2>
          <p className="text-sm text-muted-foreground">
            Model Context Protocol — connect to external tools or expose yours
          </p>
        </div>
        {activeTab === "clients" && (
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/dashboard/marketplace/mcp">
                <Store className="h-4 w-4 mr-1" />
                Browse Marketplace
              </Link>
            </Button>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add Server
            </Button>
          </div>
        )}
      </div>

      <div>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="clients">MCP Clients</TabsTrigger>
              <TabsTrigger value="server">MCP Server</TabsTrigger>
            </TabsList>

            {/* MCP Clients Tab */}
            <TabsContent value="clients" className="space-y-6">
              {/* Server List */}
              <div className="space-y-4">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : servers.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <Plug className="h-10 w-10 text-muted-foreground mb-3" />
                      <h3 className="text-sm font-medium mb-1">
                        No MCP servers configured
                      </h3>
                      <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
                        Connect external tool providers to extend your assistants
                        with additional capabilities via MCP. Install from the
                        Marketplace or add a custom server.
                      </p>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" asChild>
                          <Link href="/dashboard/marketplace/mcp">
                            <Store className="h-4 w-4 mr-1" />
                            Browse Marketplace
                          </Link>
                        </Button>
                        <Button size="sm" onClick={() => setDialogOpen(true)}>
                          <Plus className="h-4 w-4 mr-1" />
                          Add Custom Server
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  servers.map((server) => (
                    <Collapsible
                      key={server.id}
                      open={expandedServer === server.id}
                      onOpenChange={() => handleExpand(server.id)}
                    >
                      <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <div className="flex items-center gap-3 min-w-0">
                            <CollapsibleTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 shrink-0"
                              >
                                {expandedServer === server.id ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </Button>
                            </CollapsibleTrigger>
                            <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center shrink-0">
                              <DynamicIcon
                                icon={server.icon ?? undefined}
                                fallback={Plug}
                                className="h-4 w-4 text-muted-foreground"
                                emojiClassName="text-base leading-none"
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <h3 className="font-medium truncate">
                                  {server.name}
                                </h3>
                                {transportBadge(server.transport)}
                                {server.isBuiltIn && (
                                  <Badge variant="secondary" className="text-[10px]">
                                    Built-in
                                  </Badge>
                                )}
                                {statusIndicator(server)}
                              </div>
                              {server.description && (
                                <p className="text-xs text-muted-foreground truncate">
                                  {server.description}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {!server.configured && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setEditingServer(server)
                                }}
                              >
                                <Settings2 className="h-3.5 w-3.5 mr-1" />
                                Configure
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              disabled={discoveringServer === server.id}
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDiscover(server.id)
                              }}
                              title="Discover tools"
                            >
                              <RefreshCw
                                className={`h-3.5 w-3.5 ${
                                  discoveringServer === server.id
                                    ? "animate-spin"
                                    : ""
                                }`}
                              />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditingServer(server)
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {!server.isBuiltIn && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setDeletingServer(server.id)
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Switch
                              checked={server.enabled}
                              onCheckedChange={(checked) =>
                                handleToggle(server.id, checked)
                              }
                            />
                          </div>
                        </CardHeader>

                        <CardContent className="pb-2">
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Wrench className="h-3 w-3" />
                              {server.toolCount} tool
                              {server.toolCount !== 1 && "s"}
                            </span>
                            {server.url && (
                              <span className="truncate font-mono">
                                {server.url}
                              </span>
                            )}
                          </div>
                          {server.lastError && (
                            <p className="text-xs text-destructive mt-1 truncate">
                              {server.lastError}
                            </p>
                          )}
                        </CardContent>

                        <CollapsibleContent>
                          <CardContent className="pt-0 border-t mt-2">
                            <h4 className="text-sm font-medium mb-2 pt-3">
                              Discovered Tools
                            </h4>
                            {serverTools[server.id]?.length ? (
                              <div className="space-y-2">
                                {serverTools[server.id].map((tool) => (
                                  <div
                                    key={tool.id}
                                    className="flex items-start gap-2 p-2 rounded bg-muted/50"
                                  >
                                    <Wrench className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium">
                                        {tool.displayName || tool.name}
                                      </p>
                                      <p className="text-xs text-muted-foreground line-clamp-2">
                                        {tool.description}
                                      </p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground py-2">
                                No tools discovered yet. Click the refresh button
                                to discover tools from this server.
                              </p>
                            )}
                          </CardContent>
                        </CollapsibleContent>
                      </Card>
                    </Collapsible>
                  ))
                )}
              </div>
            </TabsContent>

            {/* MCP Server Tab */}
            <TabsContent value="server">
              <McpServerConfig />
            </TabsContent>
          </Tabs>
      </div>

      <McpServerDialog
        open={dialogOpen || !!editingServer}
        onOpenChange={(open) => {
          if (!open) {
            setDialogOpen(false)
            setEditingServer(null)
          }
        }}
        editServer={editingServer}
      />

      <AlertDialog
        open={!!deletingServer}
        onOpenChange={(open) => !open && setDeletingServer(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete MCP Server</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the server configuration and all its discovered
              tools. Tools will be disconnected from any assistants using them.
              This action cannot be undone.
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
