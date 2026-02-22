"use client"

import { useState, useEffect, useCallback, useRef, use } from "react"
import { useRouter } from "next/navigation"
import { useAssistants } from "@/hooks/use-assistants"
import { useDefaultAssistant } from "@/hooks/use-default-assistant"
import { useAssistantTools } from "@/hooks/use-assistant-tools"
import { useAssistantSkills } from "@/hooks/use-assistant-skills"
import { getModelById, DEFAULT_MODEL_ID } from "@/lib/models"
import { AgentEditorLayout, type TabId } from "../_components/agent-editor-layout"
import { TabConfigure } from "../_components/tab-configure"
import { TabModel } from "../_components/tab-model"
import { TabTools } from "../_components/tab-tools"
import { TabSkills } from "../_components/tab-skills"
import { TabKnowledge } from "../_components/tab-knowledge"
import { TabMemory } from "../_components/tab-memory"
import { TabChatPreferences } from "../_components/tab-chat-preferences"
import { GuardRailsSettings } from "../_components/guard-rails-settings"
import { TabTest } from "../_components/tab-test"
import { TabDeploy } from "../_components/tab-deploy"
import type { Assistant, MemoryConfig, ModelConfig, ChatConfig, GuardRailsConfig } from "@/lib/types/assistant"

const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  enabled: true,
  workingMemory: true,
  semanticRecall: true,
  longTermProfile: true,
}

const DEFAULT_MODEL_CONFIG: ModelConfig = {}

const DEFAULT_CHAT_CONFIG: ChatConfig = {
  autoCreateTopic: true,
  messageThreshold: 2,
  limitHistory: true,
  historyCount: 20,
  autoSummary: true,
  autoScroll: false,
}

const DEFAULT_GUARD_RAILS: GuardRailsConfig = {}

interface FormState {
  name: string
  description: string
  emoji: string
  avatarS3Key: string
  avatarUrl: string
  model: string
  systemPrompt: string
  selectedToolIds: string[]
  selectedSkillIds: string[]
  useKnowledgeBase: boolean
  knowledgeBaseGroupIds: string[]
  memoryConfig: MemoryConfig
  modelConfig: ModelConfig
  chatConfig: ChatConfig
  guardRails: GuardRailsConfig
  liveChatEnabled: boolean
  openingMessage: string
  openingQuestions: string[]
}

function getInitialState(agent?: Assistant | null): FormState {
  return {
    name: agent?.name ?? "",
    description: agent?.description ?? "",
    emoji: agent?.emoji ?? "🤖",
    avatarS3Key: agent?.avatarS3Key ?? "",
    avatarUrl: "",
    model: agent?.model ?? DEFAULT_MODEL_ID,
    systemPrompt: agent?.systemPrompt ?? "",
    selectedToolIds: [],
    selectedSkillIds: [],
    useKnowledgeBase: agent?.useKnowledgeBase ?? false,
    knowledgeBaseGroupIds: agent?.knowledgeBaseGroupIds ?? [],
    memoryConfig: agent?.memoryConfig ?? DEFAULT_MEMORY_CONFIG,
    modelConfig: agent?.modelConfig ?? DEFAULT_MODEL_CONFIG,
    chatConfig: agent?.chatConfig ?? DEFAULT_CHAT_CONFIG,
    guardRails: agent?.guardRails ?? DEFAULT_GUARD_RAILS,
    liveChatEnabled: agent?.liveChatEnabled ?? false,
    openingMessage: agent?.openingMessage ?? "",
    openingQuestions: agent?.openingQuestions ?? [],
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

  const {
    enabledSkillIds,
    updateAssistantSkills,
    isLoading: skillsLoading,
  } = useAssistantSkills(isNew ? null : id)

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

  // Sync skill IDs from the server
  useEffect(() => {
    if (!isNew && !skillsLoading && initializedRef.current) {
      setForm((prev) => ({ ...prev, selectedSkillIds: enabledSkillIds }))
    }
  }, [isNew, skillsLoading, enabledSkillIds])

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

  const handleToggleSkill = useCallback(
    (skillId: string) => {
      setForm((prev) => {
        const current = prev.selectedSkillIds
        const isEnabled = current.includes(skillId)
        const next = isEnabled
          ? current.filter((sid) => sid !== skillId)
          : [...current, skillId]
        return { ...prev, selectedSkillIds: next }
      })
      setIsDirty(true)
    },
    []
  )

  // Avatar upload handler
  const handleAvatarUpload = useCallback((s3Key: string, url: string) => {
    setForm((prev) => ({ ...prev, avatarS3Key: s3Key, avatarUrl: url }))
    setIsDirty(true)
  }, [])

  const handleAvatarRemove = useCallback(() => {
    setForm((prev) => ({ ...prev, avatarS3Key: "", avatarUrl: "" }))
    setIsDirty(true)
  }, [])

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
        modelConfig: form.modelConfig,
        chatConfig: form.chatConfig,
        guardRails: form.guardRails,
        liveChatEnabled: form.liveChatEnabled,
        openingMessage: form.openingMessage || undefined,
        openingQuestions: form.openingQuestions.filter((q) => q.trim()),
        avatarS3Key: form.avatarS3Key || undefined,
      }

      if (isNew) {
        const created = await addAssistant(input)
        if (created) {
          // After create, update tools and skills if any were selected
          const promises: Promise<unknown>[] = []
          if (form.selectedToolIds.length > 0) {
            promises.push(
              fetch(`/api/assistants/${created.id}/tools`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ toolIds: form.selectedToolIds }),
              }).catch(() => {})
            )
          }
          if (form.selectedSkillIds.length > 0) {
            promises.push(
              fetch(`/api/assistants/${created.id}/skills`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ skillIds: form.selectedSkillIds }),
              }).catch(() => {})
            )
          }
          await Promise.all(promises)
          refetch()
          router.replace(`/dashboard/agent-builder/${created.id}`)
        }
      } else {
        const success = await updateAssistant(id, input)
        if (success) {
          // Update tool and skill bindings
          await Promise.all([
            updateAssistantTools(form.selectedToolIds),
            updateAssistantSkills(form.selectedSkillIds),
          ])
          refetch()
          setIsDirty(false)
        }
      }
    } finally {
      setIsSaving(false)
    }
  }, [form, isNew, id, addAssistant, updateAssistant, updateAssistantTools, updateAssistantSkills, refetch, router])

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
      modelConfig: form.modelConfig,
      chatConfig: form.chatConfig,
      guardRails: form.guardRails,
      liveChatEnabled: form.liveChatEnabled,
      openingMessage: form.openingMessage,
      openingQuestions: form.openingQuestions,
      avatarS3Key: form.avatarS3Key || undefined,
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
    modelConfig: form.modelConfig,
    chatConfig: form.chatConfig,
    guardRails: form.guardRails,
    toolCount: form.selectedToolIds.length,
    skillCount: form.selectedSkillIds.length,
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
          avatarUrl={form.avatarUrl || null}
          systemPrompt={form.systemPrompt}
          liveChatEnabled={form.liveChatEnabled}
          openingMessage={form.openingMessage}
          openingQuestions={form.openingQuestions}
          isNew={isNew}
          onNameChange={(v) => updateField("name", v)}
          onDescriptionChange={(v) => updateField("description", v)}
          onEmojiChange={(v) => updateField("emoji", v)}
          onAvatarUpload={handleAvatarUpload}
          onAvatarRemove={handleAvatarRemove}
          onSystemPromptChange={(v) => updateField("systemPrompt", v)}
          onLiveChatEnabledChange={(v) => updateField("liveChatEnabled", v)}
          onOpeningMessageChange={(v) => updateField("openingMessage", v)}
          onOpeningQuestionsChange={(v) => updateField("openingQuestions", v)}
        />
      )}
      {activeTab === "model" && (
        <TabModel
          model={form.model}
          modelConfig={form.modelConfig}
          onModelChange={(v) => updateField("model", v)}
          onModelConfigChange={(v) => updateField("modelConfig", v)}
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
      {activeTab === "skills" && (
        <TabSkills
          selectedSkillIds={form.selectedSkillIds}
          onToggleSkill={handleToggleSkill}
          isNew={isNew}
          assistantId={isNew ? null : id}
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
      {activeTab === "guardrails" && (
        <GuardRailsSettings
          config={form.guardRails}
          onChange={(config) => updateField("guardRails", config)}
        />
      )}
      {activeTab === "chat" && (
        <TabChatPreferences
          chatConfig={form.chatConfig}
          onChatConfigChange={(config) => updateField("chatConfig", config)}
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
