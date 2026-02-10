"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Plus, Search, Bot } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { useAssistants } from "@/hooks/use-assistants"
import { useDefaultAssistant } from "@/hooks/use-default-assistant"
import { DashboardPageHeader } from "../_components/dashboard-page-header"
import { AgentCard } from "./_components/agent-card"
import { AgentTemplateGallery } from "./_components/agent-template-gallery"
import type { Assistant } from "@/lib/types/assistant"

export default function AgentBuilderPage() {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<Assistant | null>(null)

  const {
    assistants,
    isLoading,
    addAssistant,
    deleteAssistant,
    refetch,
  } = useAssistants()

  const {
    assistant: defaultAssistant,
    source: defaultSource,
    setUserDefault,
    clearUserDefault,
    refetch: refetchDefault,
  } = useDefaultAssistant()

  const filtered = search
    ? assistants.filter(
        (a) =>
          a.name.toLowerCase().includes(search.toLowerCase()) ||
          a.description.toLowerCase().includes(search.toLowerCase())
      )
    : assistants

  const handleCreate = () => {
    router.push("/dashboard/agent-builder/new")
  }

  const handleClick = (agent: Assistant) => {
    router.push(`/dashboard/agent-builder/${agent.id}`)
  }

  const handleDuplicate = useCallback(
    async (agent: Assistant) => {
      const newAgent = await addAssistant({
        name: `${agent.name} (Copy)`,
        description: agent.description,
        emoji: agent.emoji,
        systemPrompt: agent.systemPrompt,
        model: agent.model,
        useKnowledgeBase: agent.useKnowledgeBase,
        knowledgeBaseGroupIds: agent.knowledgeBaseGroupIds,
        memoryConfig: agent.memoryConfig,
      })
      if (newAgent) {
        refetch()
        router.push(`/dashboard/agent-builder/${newAgent.id}`)
      }
    },
    [addAssistant, refetch, router]
  )

  const handleSetDefault = useCallback(
    async (agent: Assistant) => {
      const isCurrentDefault =
        defaultSource === "user" && defaultAssistant?.id === agent.id
      if (isCurrentDefault) {
        await clearUserDefault()
      } else {
        await setUserDefault(agent.id)
      }
      refetchDefault()
    },
    [defaultAssistant, defaultSource, setUserDefault, clearUserDefault, refetchDefault]
  )

  const handleDelete = async () => {
    if (deleteTarget) {
      await deleteAssistant(deleteTarget.id)
      setDeleteTarget(null)
      refetch()
      refetchDefault()
    }
  }

  const isDefault = (agent: Assistant) => defaultAssistant?.id === agent.id

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <DashboardPageHeader title="Agent Builder" />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <DashboardPageHeader
        title="Agent Builder"
        actions={
          <Button onClick={handleCreate} size="sm">
            <Plus className="h-4 w-4 mr-1.5" />
            Create Agent
          </Button>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        {/* Template Gallery */}
        <AgentTemplateGallery addAssistant={addAssistant} refetch={refetch} />

        {/* Search */}
        <div className="relative max-w-sm mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search agents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Bot className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold mb-1">
              {search ? "No agents match your search" : "No agents yet"}
            </h2>
            <p className="text-sm text-muted-foreground max-w-md mb-4">
              {search
                ? "Try a different search term"
                : "Create your first agent to get started with the Agent Builder."}
            </p>
            {!search && (
              <Button onClick={handleCreate}>
                <Plus className="h-4 w-4 mr-1.5" />
                Create Agent
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                isDefault={isDefault(agent)}
                onClick={() => handleClick(agent)}
                onDuplicate={() => handleDuplicate(agent)}
                onSetDefault={() => handleSetDefault(agent)}
                onDelete={() => setDeleteTarget(agent)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Agent?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{deleteTarget?.name}&quot;. This action
              cannot be undone.
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
