"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Plus,
  KeyRound,
  Copy,
  Check,
  Eye,
  EyeOff,
  Trash2,
  Edit,
  ToggleLeft,
  ToggleRight,
  Clock,
  Shield,
} from "@/lib/icons"
import { useAgentApiKeys } from "@/hooks/use-agent-api-keys"
import { maskApiKey } from "@/lib/embed/api-key-generator"
import type { AgentApiKeyResponse } from "@/src/features/agent-api-keys/service"
import { DeployApiKeyDialog } from "./deploy-api-key-dialog"
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

interface DeployRestApiSectionProps {
  agentId: string
  agentName: string
}

export function DeployRestApiSection({ agentId, agentName }: DeployRestApiSectionProps) {
  const { keys, isLoading, createKey, updateKey, deleteKey } = useAgentApiKeys(agentId)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editingKey, setEditingKey] = useState<AgentApiKeyResponse | null>(null)
  const [deleteConfirmKey, setDeleteConfirmKey] = useState<AgentApiKeyResponse | null>(null)
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set())
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [copiedExample, setCopiedExample] = useState<string | null>(null)

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://your-domain.com"
  const exampleKey = keys[0]?.key || "rantai_sk_your_api_key_here"

  const handleCopyKey = (key: string, id: string) => {
    navigator.clipboard.writeText(key)
    setCopiedKey(id)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const toggleRevealKey = (id: string) => {
    const newSet = new Set(revealedKeys)
    if (newSet.has(id)) newSet.delete(id)
    else newSet.add(id)
    setRevealedKeys(newSet)
  }

  const copyExample = (id: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedExample(id)
    setTimeout(() => setCopiedExample(null), 2000)
  }

  const curlExample = `curl -X POST ${baseUrl}/api/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${exampleKey}" \\
  -d '{
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": false
  }'`

  const pythonExample = `from openai import OpenAI

client = OpenAI(
    base_url="${baseUrl}/api/v1",
    api_key="${exampleKey}",
)

response = client.chat.completions.create(
    model="${agentName}",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(response.choices[0].message.content)`

  const jsExample = `const response = await fetch("${baseUrl}/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer ${exampleKey}",
  },
  body: JSON.stringify({
    messages: [{ role: "user", content: "Hello!" }],
    stream: false,
  }),
});

const data = await response.json();
console.log(data.choices[0].message.content);`

  if (isLoading) {
    return <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">Loading...</div>
  }

  return (
    <div className="space-y-6">
      {/* API Keys */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Create API keys for programmatic access. Compatible with the OpenAI SDK.
          </p>
          <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Create API Key
          </Button>
        </div>

        {keys.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-10">
              <KeyRound className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground text-center mb-3">
                No API keys yet. Create one to access this agent programmatically.
              </p>
              <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Create First Key
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {keys.map((key) => (
              <Card key={key.id} className={!key.enabled ? "opacity-60" : ""}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{key.name}</span>
                      {!key.enabled && <Badge variant="secondary" className="text-xs">Disabled</Badge>}
                      {key.expiresAt && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          Expires {new Date(key.expiresAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingKey(key)}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => updateKey(key.id, { enabled: !key.enabled })}>
                        {key.enabled ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDeleteConfirmKey(key)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-2.5 py-1.5 bg-muted rounded font-mono text-xs truncate">
                      {revealedKeys.has(key.id) ? key.key : maskApiKey(key.key)}
                    </code>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggleRevealKey(key.id)}>
                      {revealedKeys.has(key.id) ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleCopyKey(key.key, key.id)}>
                      {copiedKey === key.id ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                  <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                    <span>{key.requestCount.toLocaleString()} requests</span>
                    {key.scopes.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Shield className="h-3 w-3" />
                        {key.scopes.join(", ")}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Code Examples */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium">Code Examples</h4>
        <Tabs defaultValue="curl">
          <TabsList className="h-8">
            <TabsTrigger value="curl" className="text-xs px-3 h-7">cURL</TabsTrigger>
            <TabsTrigger value="python" className="text-xs px-3 h-7">Python</TabsTrigger>
            <TabsTrigger value="javascript" className="text-xs px-3 h-7">JavaScript</TabsTrigger>
          </TabsList>
          {[
            { id: "curl", code: curlExample },
            { id: "python", code: pythonExample },
            { id: "javascript", code: jsExample },
          ].map(({ id, code }) => (
            <TabsContent key={id} value={id}>
              <div className="relative">
                <pre className="rounded-lg border bg-muted/50 p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                  {code}
                </pre>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 h-7 w-7"
                  onClick={() => copyExample(id, code)}
                >
                  {copiedExample === id ? (
                    <Check className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* Endpoint info */}
      <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
        <p><strong>Endpoint:</strong> <code>POST {baseUrl}/api/v1/chat/completions</code></p>
        <p><strong>Auth:</strong> <code>Authorization: Bearer rantai_sk_...</code></p>
        <p><strong>Format:</strong> OpenAI-compatible. Works with <code>openai</code> Python/JS SDK.</p>
        <p><strong>Rate limit:</strong> 100 requests/minute per key</p>
      </div>

      {/* Dialogs */}
      <DeployApiKeyDialog
        open={createDialogOpen || !!editingKey}
        onOpenChange={(open) => {
          if (!open) { setCreateDialogOpen(false); setEditingKey(null) }
        }}
        editingKey={editingKey}
        assistantId={agentId}
        onSave={async (input) => {
          if (editingKey) {
            await updateKey(editingKey.id, input)
          } else {
            await createKey(input)
          }
        }}
      />

      <AlertDialog open={!!deleteConfirmKey} onOpenChange={(open) => !open && setDeleteConfirmKey(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete API Key?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &ldquo;{deleteConfirmKey?.name}&rdquo;. Applications using this key will stop working.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteConfirmKey) { deleteKey(deleteConfirmKey.id); setDeleteConfirmKey(null) } }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
