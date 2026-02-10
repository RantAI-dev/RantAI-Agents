"use client"

import { useState, useEffect, useCallback, useRef, use } from "react"
import { useRouter } from "next/navigation"
import { useAssistants } from "@/hooks/use-assistants"
import { useDefaultAssistant } from "@/hooks/use-default-assistant"
import { useAssistantTools } from "@/hooks/use-assistant-tools"
import { getModelById, DEFAULT_MODEL_ID } from "@/lib/models"
import { AgentEditorLayout, type TabId } from "../_components/agent-editor-layout"
import { TabConfigure } from "../_components/tab-configure"
import { TabTools } from "../_components/tab-tools"
import { TabKnowledge } from "../_components/tab-knowledge"
import { TabMemory } from "../_components/tab-memory"
import { TabTest } from "../_components/tab-test"
import { TabDeploy } from "../_components/tab-deploy"
import type { Assistant, MemoryConfig } from "@/lib/types/assistant"

const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  enabled: true,
  workingMemory: true,
  semanticRecall: true,
  longTermProfile: true,
}

interface FormState {
  name: string
  description: string
  emoji: string
  model: string
  systemPrompt: string
  selectedToolIds: string[]
  useKnowledgeBase: boolean
  knowledgeBaseGroupIds: string[]
  memoryConfig: MemoryConfig
  liveChatEnabled: boolean
}

function getInitialState(agent?: Assistant | null): FormState {
  return {
    name: agent?.name ?? "",
    description: agent?.description ?? "",
    emoji: agent?.emoji ?? "🤖",
    model: agent?.model ?? DEFAULT_MODEL_ID,
    systemPrompt: agent?.systemPrompt ?? "",
    selectedToolIds: [],
    useKnowledgeBase: agent?.useKnowledgeBase ?? false,
    knowledgeBaseGroupIds: agent?.knowledgeBaseGroupIds ?? [],
    memoryConfig: agent?.memoryConfig ?? DEFAULT_MEMORY_CONFIG,
    liveChatEnabled: agent?.liveChatEnabled ?? false,
  }
}

export default function AgentEditorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const isNew = id === "new"
  const router = useRouter()

  const {
    assistants,
    isLoading,
    addAssistant,
    updateAssistant,
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

  const {
    enabledToolIds,
    updateAssistantTools,
    isLoading: toolsLoading,
  } = useAssistantTools(isNew ? null : id)

  const [activeTab, setActiveTab] = useState<TabId>("configure")
  const [form, setForm] = useState<FormState>(getInitialState())
  const [isSaving, setIsSaving] = useState(false)
  const [isDirty, setIsDirty] = useState(isNew)
  const initializedRef = useRef(false)

  // Load existing agent data
  useEffect(() => {
    if (isNew || isLoading || initializedRef.current) return
    const agent = assistants.find((a) => a.id === id)
    if (agent) {
      setForm(getInitialState(agent))
      initializedRef.current = true
    }
  }, [isNew, isLoading, assistants, id])

  // Sync tool IDs from the server
  useEffect(() => {
    if (!isNew && !toolsLoading && initializedRef.current) {
      setForm((prev) => ({ ...prev, selectedToolIds: enabledToolIds }))
    }
  }, [isNew, toolsLoading, enabledToolIds])

  // Track dirty state
  const updateField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setIsDirty(true)
  }, [])

  const handleToggleTool = useCallback(
    (toolId: string) => {
      setForm((prev) => {
        const current = prev.selectedToolIds
        const isEnabled = current.includes(toolId)
        const next = isEnabled
          ? current.filter((tid) => tid !== toolId)
          : [...current, toolId]
        return { ...prev, selectedToolIds: next }
      })
      setIsDirty(true)
    },
    []
  )

  // Save handler
  const handleSave = useCallback(async () => {
    setIsSaving(true)
    try {
      const input = {
        name: form.name || "Untitled Agent",
        description: form.description,
        emoji: form.emoji,
        systemPrompt: form.systemPrompt,
        model: form.model,
        useKnowledgeBase: form.useKnowledgeBase,
        knowledgeBaseGroupIds: form.knowledgeBaseGroupIds,
        memoryConfig: form.memoryConfig,
        liveChatEnabled: form.liveChatEnabled,
      }

      if (isNew) {
        const created = await addAssistant(input)
        if (created) {
          // After create, update tools if any were selected
          if (form.selectedToolIds.length > 0) {
            try {
              await fetch(`/api/assistants/${created.id}/tools`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ toolIds: form.selectedToolIds }),
              })
            } catch {
              // Tool update failed, but agent was created
            }
          }
          refetch()
          router.replace(`/dashboard/agent-builder/${created.id}`)
        }
      } else {
        const success = await updateAssistant(id, input)
        if (success) {
          // Update tool bindings
          await updateAssistantTools(form.selectedToolIds)
          refetch()
          setIsDirty(false)
        }
      }
    } finally {
      setIsSaving(false)
    }
  }, [form, isNew, id, addAssistant, updateAssistant, updateAssistantTools, refetch, router])

  // Actions
  const handleDuplicate = useCallback(async () => {
    const created = await addAssistant({
      name: `${form.name} (Copy)`,
      description: form.description,
      emoji: form.emoji,
      systemPrompt: form.systemPrompt,
      model: form.model,
      useKnowledgeBase: form.useKnowledgeBase,
      knowledgeBaseGroupIds: form.knowledgeBaseGroupIds,
      memoryConfig: form.memoryConfig,
      liveChatEnabled: form.liveChatEnabled,
    })
    if (created) {
      refetch()
      router.push(`/dashboard/agent-builder/${created.id}`)
    }
  }, [form, addAssistant, refetch, router])

  const handleSetDefault = useCallback(async () => {
    const isCurrentDefault = defaultSource === "user" && defaultAssistant?.id === id
    if (isCurrentDefault) {
      await clearUserDefault()
    } else {
      await setUserDefault(id)
    }
    refetchDefault()
  }, [id, defaultAssistant, defaultSource, setUserDefault, clearUserDefault, refetchDefault])

  const handleDelete = useCallback(async () => {
    await deleteAssistant(id)
    refetch()
    router.push("/dashboard/agent-builder")
  }, [id, deleteAssistant, refetch, router])

  // Build a test assistant from form state
  const formAssistant: Assistant = {
    id: isNew ? "new" : id,
    name: form.name || "Untitled Agent",
    description: form.description,
    emoji: form.emoji,
    systemPrompt: form.systemPrompt,
    model: form.model,
    useKnowledgeBase: form.useKnowledgeBase,
    knowledgeBaseGroupIds: form.knowledgeBaseGroupIds,
    memoryConfig: form.memoryConfig,
    toolCount: form.selectedToolIds.length,
    createdAt: new Date(),
  }

  const model = getModelById(form.model)
  const modelSupportsFunctionCalling = model?.capabilities.functionCalling ?? false
  const isDefault = defaultAssistant?.id === id

  if (isLoading && !isNew) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <AgentEditorLayout
      agentName={form.name || "Untitled Agent"}
      agentEmoji={form.emoji}
      isNew={isNew}
      isDirty={isDirty}
      isSaving={isSaving}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onSave={handleSave}
      onDuplicate={isNew ? undefined : handleDuplicate}
      onSetDefault={isNew ? undefined : handleSetDefault}
      onDelete={isNew ? undefined : handleDelete}
      isDefault={isDefault}
    >
      {activeTab === "configure" && (
        <TabConfigure
          name={form.name}
          description={form.description}
          emoji={form.emoji}
          model={form.model}
          systemPrompt={form.systemPrompt}
          onNameChange={(v) => updateField("name", v)}
          onDescriptionChange={(v) => updateField("description", v)}
          onEmojiChange={(v) => updateField("emoji", v)}
          onModelChange={(v) => updateField("model", v)}
          onSystemPromptChange={(v) => updateField("systemPrompt", v)}
          liveChatEnabled={form.liveChatEnabled}
          onLiveChatEnabledChange={(v) => updateField("liveChatEnabled", v)}
        />
      )}
      {activeTab === "tools" && (
        <TabTools
          selectedToolIds={form.selectedToolIds}
          onToggleTool={handleToggleTool}
          modelSupportsFunctionCalling={modelSupportsFunctionCalling}
          isNew={isNew}
        />
      )}
      {activeTab === "knowledge" && (
        <TabKnowledge
          useKnowledgeBase={form.useKnowledgeBase}
          knowledgeBaseGroupIds={form.knowledgeBaseGroupIds}
          onUseKnowledgeBaseChange={(v) => updateField("useKnowledgeBase", v)}
          onKnowledgeBaseGroupIdsChange={(ids) => updateField("knowledgeBaseGroupIds", ids)}
        />
      )}
      {activeTab === "memory" && (
        <TabMemory
          memoryConfig={form.memoryConfig}
          onMemoryConfigChange={(config) => updateField("memoryConfig", config)}
        />
      )}
      {activeTab === "test" && (
        <TabTest
          agentId={isNew ? null : id}
          isNew={isNew}
          formAssistant={formAssistant}
        />
      )}
      {activeTab === "deploy" && (
        <TabDeploy
          agentId={isNew ? null : id}
          agentName={form.name || "Untitled Agent"}
          isNew={isNew}
        />
      )}
    </AgentEditorLayout>
  )
}
