"use client"

import { useCallback, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useAssistants, type DbAssistant } from "@/hooks/use-assistants"
import { useModels } from "@/hooks/use-models"
import { useWizardDraft } from "../hooks/use-wizard-draft"
import { WizardChat } from "./wizard-chat"
import { WizardPreview } from "./wizard-preview"
import { WizardActionBar } from "./wizard-action-bar"
import {
  isNameValid,
  isSystemPromptValid,
} from "@/features/assistants/core/completeness"
import type {
  MemoryConfig,
  ModelConfig,
  ChatConfig,
  GuardRailsConfig,
} from "@/lib/types/assistant"

interface CatalogEntry {
  id: string
  name: string
  description?: string
}

interface Props {
  initialAssistants: DbAssistant[]
  catalogs: {
    tools: CatalogEntry[]
    skills: CatalogEntry[]
    mcp: CatalogEntry[]
    kbs: CatalogEntry[]
  }
}

const DEFAULT_BLANK_PROMPT = `## Goal
Describe what this agent does.

## Skills
-

## Workflow
1.

## Constraints
- `

export function WizardPageClient({ initialAssistants, catalogs }: Props) {
  const router = useRouter()
  const { addAssistant, refetch } = useAssistants({ initialAssistants })
  const { models } = useModels()
  const { state, applyProposal, applyRefinement, userEdit, reset } =
    useWizardDraft()
  const [isCreating, setIsCreating] = useState(false)

  const modelCatalog: CatalogEntry[] = useMemo(
    () =>
      models.map((m) => ({
        id: m.id,
        name: m.name,
        description: m.description,
      })),
    [models]
  )

  const canCreate =
    isNameValid(state.draft.name ?? "") &&
    isSystemPromptValid(state.draft.systemPrompt ?? "") &&
    Boolean(state.draft.model)

  const handleCreate = useCallback(async () => {
    if (!canCreate) return
    setIsCreating(true)
    try {
      const d = state.draft
      const created = await addAssistant({
        name: d.name!,
        description: d.description ?? "",
        emoji: d.emoji ?? "🤖",
        systemPrompt: d.systemPrompt!,
        model: d.model!,
        useKnowledgeBase: d.useKnowledgeBase ?? false,
        knowledgeBaseGroupIds: d.knowledgeBaseGroupIds ?? [],
        openingMessage: d.openingMessage || undefined,
        openingQuestions: (d.openingQuestions ?? []).filter((q) => q.trim()),
        liveChatEnabled: d.liveChatEnabled ?? false,
        tags: d.tags ?? [],
        memoryConfig: d.memoryConfig as MemoryConfig | undefined,
        modelConfig: d.modelConfig as ModelConfig | undefined,
        chatConfig: d.chatConfig as ChatConfig | undefined,
        guardRails: d.guardRails as GuardRailsConfig | undefined,
      })
      if (!created) return

      const bindings: Promise<unknown>[] = []
      if ((d.selectedToolIds ?? []).length > 0) {
        bindings.push(
          fetch(`/api/assistants/${created.id}/tools`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ toolIds: d.selectedToolIds }),
          })
        )
      }
      if ((d.selectedSkillIds ?? []).length > 0) {
        bindings.push(
          fetch(`/api/assistants/${created.id}/skills`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ skillIds: d.selectedSkillIds }),
          })
        )
      }
      if ((d.selectedMcpServerIds ?? []).length > 0) {
        bindings.push(
          fetch(`/api/assistants/${created.id}/mcp-servers`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mcpServerIds: d.selectedMcpServerIds }),
          })
        )
      }
      if ((d.selectedWorkflowIds ?? []).length > 0) {
        bindings.push(
          fetch(`/api/assistants/${created.id}/workflows`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workflowIds: d.selectedWorkflowIds }),
          })
        )
      }
      await Promise.all(bindings)
      refetch()
      router.replace(`/dashboard/agent-builder/${created.id}`)
    } finally {
      setIsCreating(false)
    }
  }, [state.draft, canCreate, addAssistant, refetch, router])

  const handleSkipToManual = useCallback(async () => {
    const created = await addAssistant({
      name: "Untitled Agent",
      description: "",
      emoji: "🤖",
      systemPrompt: DEFAULT_BLANK_PROMPT,
      useKnowledgeBase: false,
    })
    if (created) {
      refetch()
      router.replace(`/dashboard/agent-builder/${created.id}`)
    }
  }, [addAssistant, refetch, router])

  return (
    <div className="flex flex-col h-full">
      <WizardActionBar
        canCreate={canCreate}
        isCreating={isCreating}
        onCreate={handleCreate}
        onReset={reset}
        onSkipToManual={handleSkipToManual}
      />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 min-w-0">
          <WizardChat
            draft={state.draft}
            onProposal={applyProposal}
            onRefinement={applyRefinement}
          />
        </div>
        <div className="w-[380px] shrink-0 hidden lg:block">
          <WizardPreview
            draft={state.draft}
            uncertainty={state.uncertainty}
            catalogs={{ models: modelCatalog, ...catalogs }}
            onUserEdit={userEdit}
          />
        </div>
      </div>
    </div>
  )
}
