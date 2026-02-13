"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Plus,
  Key,
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
} from "lucide-react"
import { useEmbedKeys } from "@/hooks/use-embed-keys"
import { EmbedKeyDialog } from "./_components/embed-key-dialog"
import { EmbedCodeDialog } from "./_components/embed-code-dialog"
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

export default function EmbedSettingsPage() {
  const { keys, isLoading, createKey, updateKey, deleteKey } = useEmbedKeys()
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
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setRevealedKeys(newSet)
  }

  const handleToggleEnabled = async (key: EmbedApiKeyResponse) => {
    await updateKey(key.id, { enabled: !key.enabled })
  }

  const handleDelete = async () => {
    if (deleteConfirmKey) {
      await deleteKey(deleteConfirmKey.id)
      setDeleteConfirmKey(null)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-64 mt-1" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Embed Widget</h2>
          <p className="text-sm text-muted-foreground">
            Create API keys to embed the chat widget on your websites
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create API Key
        </Button>
      </div>

      {keys.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Key className="h-10 w-10 text-muted-foreground mb-3" />
            <h3 className="text-sm font-medium mb-1">No API Keys Yet</h3>
            <p className="text-sm text-muted-foreground text-center mb-4 max-w-md">
              Create your first API key to embed the chat widget on your website.
              Each key is tied to an assistant and can have domain restrictions.
            </p>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Create Your First Key
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {keys.map((key) => (
            <Card key={key.id} className={!key.enabled ? "opacity-60" : ""}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="text-2xl">{key.assistant?.emoji || "🤖"}</div>
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        {key.name}
                        {!key.enabled && (
                          <Badge variant="secondary">Disabled</Badge>
                        )}
                      </CardTitle>
                      <CardDescription>
                        Assistant: {key.assistant?.name || "Unknown"}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCodeDialogKey(key)}
                    >
                      <Code className="h-4 w-4 mr-2" />
                      Get Code
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingKey(key)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleToggleEnabled(key)}
                    >
                      {key.enabled ? (
                        <ToggleRight className="h-4 w-4" />
                      ) : (
                        <ToggleLeft className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDeleteConfirmKey(key)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* API Key */}
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    API Key
                  </label>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="flex-1 px-3 py-2 bg-muted rounded font-mono text-sm">
                      {revealedKeys.has(key.id) ? key.key : maskApiKey(key.key)}
                    </code>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleRevealKey(key.id)}
                    >
                      {revealedKeys.has(key.id) ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleCopyKey(key.key, key.id)}
                    >
                      {copiedKey === key.id ? (
                        <Check className="h-4 w-4 text-chart-2" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Stats */}
                <div className="flex flex-wrap gap-4 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MessageSquare className="h-4 w-4" />
                    <span>
                      <strong className="text-foreground">
                        {key.requestCount.toLocaleString()}
                      </strong>{" "}
                      requests
                    </span>
                  </div>
                  {key.lastUsedAt && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span>
                        Last used:{" "}
                        {new Date(key.lastUsedAt).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  {key.allowedDomains.length > 0 && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Globe className="h-4 w-4" />
                      <span>{key.allowedDomains.join(", ")}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
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
            await createKey(input)
          }
        }}
      />

      {/* Embed Code Dialog */}
      {codeDialogKey && (
        <EmbedCodeDialog
          open={!!codeDialogKey}
          onOpenChange={(open) => !open && setCodeDialogKey(null)}
          embedKey={codeDialogKey}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteConfirmKey}
        onOpenChange={(open) => !open && setDeleteConfirmKey(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete API Key?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the API key &ldquo;{deleteConfirmKey?.name}
              &rdquo;. Any websites using this key will stop working immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
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
