"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Plus,
  KeyRound,
  Copy,
  Check,
  Eye,
  EyeOff,
  Trash2,
  Edit,
  Code,
  Globe,
  MessageSquare,
  ToggleLeft,
  ToggleRight,
} from "@/lib/icons"
import { useEmbedKeys } from "@/hooks/use-embed-keys"
import { EmbedKeyDialog } from "@/features/embed-keys/components/embed-key-dialog"
import { EmbedCodeDialog } from "@/features/embed-keys/components/embed-code-dialog"
import { maskApiKey } from "@/lib/embed/api-key-generator"
import type { EmbedApiKeyResponse } from "@/lib/embed/types"
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

interface DeployWidgetSectionProps {
  agentId: string
}

export function DeployWidgetSection({ agentId }: DeployWidgetSectionProps) {
  const { keys, isLoading, createKey, updateKey, deleteKey } = useEmbedKeys(agentId)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editingKey, setEditingKey] = useState<EmbedApiKeyResponse | null>(null)
  const [codeDialogKey, setCodeDialogKey] = useState<EmbedApiKeyResponse | null>(null)
  const [deleteConfirmKey, setDeleteConfirmKey] = useState<EmbedApiKeyResponse | null>(null)
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set())
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

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

  if (isLoading) {
    return <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">Loading...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Create embed keys to add this agent as a chat widget on your website.
        </p>
        <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Create Embed Key
        </Button>
      </div>

      {keys.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10">
            <KeyRound className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground text-center mb-3">
              No embed keys yet. Create one to embed this agent on your website.
            </p>
            <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Create First Key
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {keys.map((key) => (
            <Card key={key.id} className={!key.enabled ? "opacity-60" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-sm flex items-center gap-2">
                      {key.name}
                      {!key.enabled && <Badge variant="secondary">Disabled</Badge>}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {key.requestCount.toLocaleString()} requests
                      {key.lastUsedAt && ` · Last used ${new Date(key.lastUsedAt).toLocaleDateString()}`}
                    </CardDescription>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setCodeDialogKey(key)}>
                      <Code className="h-3.5 w-3.5" />
                    </Button>
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
              </CardHeader>
              <CardContent className="pt-0">
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
                {key.allowedDomains.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
                    <Globe className="h-3 w-3" />
                    <span>{key.allowedDomains.join(", ")}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog — assistantId is pre-locked */}
      <EmbedKeyDialog
        open={createDialogOpen || !!editingKey}
        onOpenChange={(open) => {
          if (!open) {
            setCreateDialogOpen(false)
            setEditingKey(null)
          }
        }}
        editingKey={editingKey}
        onSave={async (input) => {
          if (editingKey) {
            await updateKey(editingKey.id, input)
          } else {
            await createKey({ ...input, assistantId: agentId })
          }
        }}
      />

      {codeDialogKey && (
        <EmbedCodeDialog
          open={!!codeDialogKey}
          onOpenChange={(open) => !open && setCodeDialogKey(null)}
          embedKey={codeDialogKey}
        />
      )}

      <AlertDialog open={!!deleteConfirmKey} onOpenChange={(open) => !open && setDeleteConfirmKey(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Embed Key?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &ldquo;{deleteConfirmKey?.name}&rdquo;. Websites using this key will stop working.
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
