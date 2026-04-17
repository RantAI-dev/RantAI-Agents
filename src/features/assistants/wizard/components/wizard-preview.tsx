"use client"

import { useMemo } from "react"
import { WizardChip } from "./wizard-chip"
import type { WizardDraft, Uncertainty } from "../schema"
import {
  isNameValid,
  isSystemPromptValid,
} from "@/features/assistants/core/completeness"

interface CatalogEntry {
  id: string
  name: string
  description?: string
}

interface Props {
  draft: WizardDraft
  uncertainty: Uncertainty
  catalogs: {
    models: CatalogEntry[]
    tools: CatalogEntry[]
    skills: CatalogEntry[]
    mcp: CatalogEntry[]
    kbs: CatalogEntry[]
  }
  onUserEdit: <K extends keyof WizardDraft>(field: K, value: WizardDraft[K]) => void
}

function entryLabel(id: string, catalog: CatalogEntry[]): string {
  return catalog.find((e) => e.id === id)?.name ?? id
}

export function WizardPreview({ draft, uncertainty, catalogs, onUserEdit }: Props) {
  const modelName = useMemo(
    () => (draft.model ? entryLabel(draft.model, catalogs.models) : "—"),
    [draft.model, catalogs.models]
  )

  const readinessItems = [
    { label: "Name", ok: isNameValid(draft.name ?? ""), required: true },
    { label: "Prompt", ok: isSystemPromptValid(draft.systemPrompt ?? ""), required: true },
    { label: "Model", ok: Boolean(draft.model), required: true },
    { label: "Opening msg", ok: Boolean(draft.openingMessage), required: false },
  ]

  return (
    <aside className="flex flex-col h-full border-l bg-muted/20 overflow-y-auto">
      <div className="p-5 space-y-5">
        {/* Identity */}
        <section className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Identity
          </p>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{draft.emoji ?? "🤖"}</span>
            <div className="min-w-0">
              <p className="text-base font-semibold truncate">
                {draft.name || <span className="text-muted-foreground">—</span>}
              </p>
              <p className="text-xs text-muted-foreground line-clamp-2">
                {draft.description || "—"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {(draft.tags ?? []).map((t) => (
              <WizardChip key={t} label={t} />
            ))}
          </div>
        </section>

        {/* Model */}
        <section className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Model
          </p>
          <WizardChip
            label={modelName}
            suggested={uncertainty.model === "ai-suggested"}
            onRemove={draft.model ? () => onUserEdit("model", "") : undefined}
          />
        </section>

        {/* Capabilities */}
        {([
          ["Tools", "selectedToolIds", catalogs.tools] as const,
          ["Skills", "selectedSkillIds", catalogs.skills] as const,
          ["MCP", "selectedMcpServerIds", catalogs.mcp] as const,
          ["Knowledge", "knowledgeBaseGroupIds", catalogs.kbs] as const,
        ]).map(([title, key, catalog]) => {
          const ids = (draft[key] ?? []) as string[]
          return (
            <section key={title} className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {title}
              </p>
              {ids.length === 0 ? (
                <p className="text-xs text-muted-foreground">—</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {ids.map((id) => (
                    <WizardChip
                      key={id}
                      label={entryLabel(id, catalog)}
                      suggested={uncertainty[key] === "ai-suggested"}
                      onRemove={() =>
                        onUserEdit(
                          key,
                          ids.filter((x) => x !== id) as WizardDraft[typeof key]
                        )
                      }
                    />
                  ))}
                </div>
              )}
            </section>
          )
        })}

        {/* Readiness strip */}
        <section className="pt-3 border-t">
          <div className="flex flex-wrap gap-2">
            {readinessItems.map((item) => (
              <span
                key={item.label}
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <span
                  className={
                    item.ok
                      ? "h-2 w-2 rounded-full bg-emerald-500"
                      : item.required
                      ? "h-2 w-2 rounded-full bg-destructive"
                      : "h-2 w-2 rounded-full border border-muted-foreground/40"
                  }
                />
                {item.label}
              </span>
            ))}
          </div>
        </section>
      </div>
    </aside>
  )
}
