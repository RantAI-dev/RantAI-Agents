"use client"

import { useCallback, useMemo, useState } from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useAssistants, type DbAssistant } from "@/hooks/use-assistants"
import { useModels } from "@/hooks/use-models"
import { useWizardDraft } from "../hooks/use-wizard-draft"
import { useWizardStream } from "../hooks/use-wizard-stream"
import { WizardActionBar } from "./wizard-action-bar"
import { WizardHero } from "./wizard-hero"
import { WizardAgentCard } from "./wizard-agent-card"
import { WizardSimpleView } from "./wizard-simple-view"
import { WizardAdvancedView } from "./wizard-advanced-view"
import { WizardRefineBar } from "./wizard-refine-bar"
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
  const stream = useWizardStream({
    onProposal: applyProposal,
    onRefinement: applyRefinement,
  })
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

  const fullCatalogs = useMemo(
    () => ({ models: modelCatalog, ...catalogs }),
    [modelCatalog, catalogs]
  )

  const hasDraft = Boolean(state.draft.name || state.draft.systemPrompt)

  const canCreate =
    isNameValid(state.draft.name ?? "") &&
    isSystemPromptValid(state.draft.systemPrompt ?? "") &&
    Boolean(state.draft.model)

  const handleSend = useCallback(
    (text: string) => {
      stream.send({
        text,
        draft: state.draft,
        history: stream.turns,
      })
    },
    [stream, state.draft]
  )

  const handleReset = useCallback(() => {
    reset()
    stream.reset()
  }, [reset, stream])

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

      const bindingResults: Array<{ kind: string; ok: boolean }> = []
      const runBinding = async (kind: string, url: string, body: unknown) => {
        try {
          const res = await fetch(url, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
          bindingResults.push({ kind, ok: res.ok })
        } catch {
          bindingResults.push({ kind, ok: false })
        }
      }

      const tasks: Promise<void>[] = []
      if ((d.selectedToolIds ?? []).length > 0) {
        tasks.push(
          runBinding("tools", `/api/assistants/${created.id}/tools`, {
            toolIds: d.selectedToolIds,
          })
        )
      }
      if ((d.selectedSkillIds ?? []).length > 0) {
        tasks.push(
          runBinding("skills", `/api/assistants/${created.id}/skills`, {
            skillIds: d.selectedSkillIds,
          })
        )
      }
      if ((d.selectedMcpServerIds ?? []).length > 0) {
        tasks.push(
          runBinding(
            "MCP servers",
            `/api/assistants/${created.id}/mcp-servers`,
            { mcpServerIds: d.selectedMcpServerIds }
          )
        )
      }
      if ((d.selectedWorkflowIds ?? []).length > 0) {
        tasks.push(
          runBinding("workflows", `/api/assistants/${created.id}/workflows`, {
            workflowIds: d.selectedWorkflowIds,
          })
        )
      }
      await Promise.all(tasks)

      const failed = bindingResults.filter((r) => !r.ok).map((r) => r.kind)
      if (failed.length > 0) {
        toast.warning(
          `Agent created, but failed to attach: ${failed.join(", ")}. You can re-add them in the editor.`
        )
      }
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
    <div className="flex flex-col h-full bg-background">
      <WizardActionBar
        hasDraft={hasDraft}
        canCreate={canCreate}
        isCreating={isCreating}
        onCreate={handleCreate}
        onReset={handleReset}
        onSkipToManual={handleSkipToManual}
      />

      <div className="flex-1 overflow-y-auto">
        {!hasDraft ? (
          <WizardHero
            turns={stream.turns}
            streaming={stream.streaming}
            error={stream.error}
            onSend={handleSend}
          />
        ) : (
          <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6 space-y-6 pb-32">
            <WizardAgentCard
              draft={state.draft}
              uncertainty={state.uncertainty}
              onUserEdit={userEdit}
            />

            <Tabs defaultValue="simple" className="w-full">
              <TabsList className="w-full max-w-xs">
                <TabsTrigger value="simple" className="flex-1">
                  Simple
                </TabsTrigger>
                <TabsTrigger value="advanced" className="flex-1">
                  Advanced
                </TabsTrigger>
              </TabsList>

              <TabsContent value="simple" className="pt-4">
                <WizardSimpleView
                  draft={state.draft}
                  uncertainty={state.uncertainty}
                  catalogs={fullCatalogs}
                  onUserEdit={userEdit}
                />
              </TabsContent>

              <TabsContent value="advanced" className="pt-4">
                <WizardAdvancedView
                  draft={state.draft}
                  uncertainty={state.uncertainty}
                  catalogs={fullCatalogs}
                  onUserEdit={userEdit}
                />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>

      {hasDraft && (
        <WizardRefineBar
          turns={stream.turns}
          streaming={stream.streaming}
          error={stream.error}
          onSend={handleSend}
        />
      )}
    </div>
  )
}
