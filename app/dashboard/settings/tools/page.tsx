"use client"

import { useState, useMemo } from "react"
import {
  Wrench,
  Plus,
  Loader2,
  Trash2,
  Pencil,
  Package,
  Plug,
  Search,
  Globe,
  Calculator,
  Clock,
  FileText,
  Type,
  BookOpen,
  Users,
  Send,
  FileDown,
  Code,
  HelpCircle,
  ChevronDown,
  AlertTriangle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
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
import { useTools, type ToolItem } from "@/hooks/use-tools"
import { ToolDialog } from "./_components/tool-dialog"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const TOOL_ICONS: Record<string, React.ElementType> = {
  knowledge_search: BookOpen,
  customer_lookup: Users,
  channel_dispatch: Send,
  document_analysis: FileText,
  file_operations: FileDown,
  web_search: Globe,
  calculator: Calculator,
  date_time: Clock,
  json_transform: Code,
  text_utilities: Type,
}

export default function ToolsSettingsPage() {
  const { tools, isLoading, updateTool, deleteTool } = useTools()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTool, setEditingTool] = useState<string | null>(null)
  const [deletingTool, setDeletingTool] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeTab, setActiveTab] = useState("all")
  const [helpOpen, setHelpOpen] = useState(false)

  const filteredTools = useMemo(() => {
    let filtered = tools
    if (activeTab !== "all") {
      filtered = filtered.filter((t) => t.category === activeTab)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (t) =>
          t.displayName.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q)
      )
    }
    return filtered
  }, [tools, activeTab, searchQuery])

  const counts = useMemo(() => {
    return {
      all: tools.length,
      builtin: tools.filter((t) => t.category === "builtin").length,
      custom: tools.filter((t) => t.category === "custom").length,
      mcp: tools.filter((t) => t.category === "mcp").length,
    }
  }, [tools])

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await updateTool(id, { enabled })
      toast.success(enabled ? "Tool enabled" : "Tool disabled")
    } catch {
      toast.error("Failed to update tool")
    }
  }

  const handleDelete = async () => {
    if (!deletingTool) return
    try {
      await deleteTool(deletingTool)
      toast.success("Tool deleted")
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete tool"
      )
    } finally {
      setDeletingTool(null)
    }
  }

  const categoryBadge = (category: string) => {
    switch (category) {
      case "builtin":
        return (
          <Badge variant="secondary">
            <Package className="h-3 w-3 mr-1" />
            Built-in
          </Badge>
        )
      case "mcp":
        return (
          <Badge variant="outline">
            <Plug className="h-3 w-3 mr-1" />
            MCP
          </Badge>
        )
      default:
        return (
          <Badge variant="outline">
            <Wrench className="h-3 w-3 mr-1" />
            Custom
          </Badge>
        )
    }
  }

  const getToolIcon = (tool: ToolItem) => {
    const Icon = TOOL_ICONS[tool.name] || Wrench
    return Icon
  }

  const renderToolCard = (tool: ToolItem) => {
    const Icon = getToolIcon(tool)
    return (
      <Card key={tool.id} className={!tool.enabled ? "opacity-60" : ""}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted shrink-0">
              <Icon className="h-4.5 w-4.5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-medium truncate">
                  {tool.displayName}
                </h3>
                {categoryBadge(tool.category)}
              </div>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                {tool.name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {!tool.isBuiltIn && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setEditingTool(tool.id)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  onClick={() => setDeletingTool(tool.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
            <Switch
              checked={tool.enabled}
              onCheckedChange={(checked) =>
                handleToggle(tool.id, checked)
              }
            />
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground line-clamp-2">
            {tool.description}
          </p>
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            {tool.assistantCount > 0 && (
              <span>
                Used by {tool.assistantCount} assistant
                {tool.assistantCount !== 1 && "s"}
              </span>
            )}
            {tool.mcpServer && (
              <span className="flex items-center gap-1">
                <Plug className="h-3 w-3" />
                {tool.mcpServer.name}
              </span>
            )}
            {tool.category === "custom" && !tool.executionConfig?.url && (
              <span className="flex items-center gap-1 text-amber-500">
                <AlertTriangle className="h-3 w-3" />
                No endpoint configured
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  const renderEmptyState = () => {
    if (searchQuery.trim()) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Search className="h-10 w-10 text-muted-foreground mb-3" />
          <h3 className="text-sm font-medium mb-1">No tools found</h3>
          <p className="text-sm text-muted-foreground">
            No tools match &quot;{searchQuery}&quot;
          </p>
        </div>
      )
    }

    if (activeTab === "custom") {
      return (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Wrench className="h-10 w-10 text-muted-foreground mb-3" />
            <h3 className="text-sm font-medium mb-1">No custom tools</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create custom tools to extend your assistants.
            </p>
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Create Tool
            </Button>
          </CardContent>
        </Card>
      )
    }

    if (activeTab === "mcp") {
      return (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Plug className="h-10 w-10 text-muted-foreground mb-3" />
            <h3 className="text-sm font-medium mb-1">No MCP tools</h3>
            <p className="text-sm text-muted-foreground">
              Connect an MCP server and discover tools in Settings &gt; MCP.
            </p>
          </CardContent>
        </Card>
      )
    }

    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Wrench className="h-10 w-10 text-muted-foreground mb-3" />
          <h3 className="text-sm font-medium mb-1">No tools yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Tools will appear here once the system seeds built-in tools.
          </p>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Create Custom Tool
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Tools</h2>
          <p className="text-sm text-muted-foreground">
            Manage agent tools that assistants can use during conversations
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Create Tool
        </Button>
      </div>

      {/* In-app documentation */}
      <Collapsible open={helpOpen} onOpenChange={setHelpOpen}>
        <div className="rounded-lg border border-muted bg-card px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">How Custom Tools Work</p>
                <p className="text-xs text-muted-foreground">
                  Create tools that your AI assistants can call during conversations.
                </p>
              </div>
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                {helpOpen ? "Hide" : "Learn more"}
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform",
                    helpOpen && "rotate-180"
                  )}
                />
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent>
            <div className="mt-4 space-y-4 text-sm border-t border-muted pt-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <h4 className="font-medium flex items-center gap-1.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">1</span>
                    Create a Tool
                  </h4>
                  <p className="text-muted-foreground text-xs leading-relaxed pl-6.5">
                    Give it a name, display name, and description. The AI reads the description to decide when to use your tool, so be specific about what it does.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <h4 className="font-medium flex items-center gap-1.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">2</span>
                    Define Parameters
                  </h4>
                  <p className="text-muted-foreground text-xs leading-relaxed pl-6.5">
                    Use the visual editor or paste JSON Schema. Parameters tell the AI what inputs your tool accepts (e.g. a city name, an ID, a search query).
                  </p>
                </div>
                <div className="space-y-1.5">
                  <h4 className="font-medium flex items-center gap-1.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">3</span>
                    Configure Execution
                  </h4>
                  <p className="text-muted-foreground text-xs leading-relaxed pl-6.5">
                    Set the HTTP endpoint URL that will be called when the AI invokes your tool. The parameters are sent as JSON in the request body.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <h4 className="font-medium flex items-center gap-1.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">4</span>
                    Assign to an Assistant
                  </h4>
                  <p className="text-muted-foreground text-xs leading-relaxed pl-6.5">
                    Go to the assistant&apos;s settings and enable your tool in the Tools tab. The assistant will then be able to call it during chats.
                  </p>
                </div>
              </div>

              <div className="rounded-md bg-muted/50 p-3 space-y-2">
                <h4 className="font-medium text-xs">Example: Weather API Tool</h4>
                <pre className="text-[11px] text-muted-foreground overflow-x-auto whitespace-pre">{`POST https://your-api.com/weather
Content-Type: application/json

Request:  { "city": "Jakarta" }
Response: { "temperature": 32, "condition": "Sunny" }`}</pre>
              </div>

              <div className="space-y-1.5">
                <h4 className="font-medium text-xs">Authentication</h4>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  You can configure <strong>Bearer Token</strong> (sends <code className="text-[11px] bg-muted px-1 rounded">Authorization: Bearer &lt;token&gt;</code>) or <strong>API Key</strong> (sends the key in a custom header like <code className="text-[11px] bg-muted px-1 rounded">X-API-Key</code>) in the Execution Config section of the tool dialog.
                </p>
              </div>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      <div className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search tools..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Category Tabs */}
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                  <TabsTrigger value="all">
                    All
                    <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">
                      {counts.all}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="builtin">
                    Built-in
                    <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">
                      {counts.builtin}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="custom">
                    Custom
                    <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">
                      {counts.custom}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="mcp">
                    MCP
                    <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">
                      {counts.mcp}
                    </Badge>
                  </TabsTrigger>
                </TabsList>

                {/* All tabs render the same filtered list */}
                {["all", "builtin", "custom", "mcp"].map((tab) => (
                  <TabsContent key={tab} value={tab} className="space-y-3 mt-4">
                    {filteredTools.length === 0
                      ? renderEmptyState()
                      : filteredTools.map(renderToolCard)}
                  </TabsContent>
                ))}
              </Tabs>
            </>
          )}
      </div>

      <ToolDialog
        open={dialogOpen || !!editingTool}
        onOpenChange={(open) => {
          if (!open) {
            setDialogOpen(false)
            setEditingTool(null)
          }
        }}
        editToolId={editingTool}
      />

      <AlertDialog
        open={!!deletingTool}
        onOpenChange={(open) => !open && setDeletingTool(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tool</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the tool and disconnect it from all assistants.
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
