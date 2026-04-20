"use client"

import { useMemo } from "react"
import { Sparkles } from "@/lib/icons"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { WizardChip } from "./wizard-chip"
import type { WizardDraft, Uncertainty } from "../schema"

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
  }
  onUserEdit: <K extends keyof WizardDraft>(field: K, value: WizardDraft[K]) => void
}

function entryName(id: string, catalog: CatalogEntry[]): string {
  return catalog.find((e) => e.id === id)?.name ?? id
}

export function WizardSimpleView({
  draft,
  uncertainty,
  catalogs,
  onUserEdit,
}: Props) {
  const aiModel = uncertainty.model === "ai-suggested"
  const aiPrompt = uncertainty.systemPrompt === "ai-suggested"

  const toolIds = draft.selectedToolIds ?? []
  const skillIds = draft.selectedSkillIds ?? []

  const sortedModels = useMemo(
    () => [...catalogs.models].sort((a, b) => a.name.localeCompare(b.name)),
    [catalogs.models]
  )

  return (
    <div className="space-y-6">
      <Field label="Model" hint={aiModel ? "AI-suggested" : undefined}>
        <Select
          value={draft.model ?? ""}
          onValueChange={(v) => onUserEdit("model", v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Pick a model" />
          </SelectTrigger>
          <SelectContent>
            {sortedModels.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field
        label="Instructions"
        hint={aiPrompt ? "AI-suggested" : undefined}
        sub="What this agent should do, how it should behave."
      >
        <Textarea
          value={draft.systemPrompt ?? ""}
          onChange={(e) => onUserEdit("systemPrompt", e.target.value)}
          rows={10}
          placeholder="## Goal&#10;Describe the agent…"
          className="font-mono text-xs leading-relaxed"
        />
      </Field>

      <Field label="Tools" sub="Things this agent can do.">
        {toolIds.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No tools yet.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {toolIds.map((id) => (
              <WizardChip
                key={id}
                label={entryName(id, catalogs.tools)}
                suggested={uncertainty[`tool:${id}`] === "ai-suggested"}
                onRemove={() =>
                  onUserEdit(
                    "selectedToolIds",
                    toolIds.filter((x) => x !== id)
                  )
                }
              />
            ))}
          </div>
        )}
      </Field>

      <Field label="Skills" sub="Reusable instruction packs.">
        {skillIds.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No skills yet.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {skillIds.map((id) => (
              <WizardChip
                key={id}
                label={entryName(id, catalogs.skills)}
                suggested={uncertainty[`skill:${id}`] === "ai-suggested"}
                onRemove={() =>
                  onUserEdit(
                    "selectedSkillIds",
                    skillIds.filter((x) => x !== id)
                  )
                }
              />
            ))}
          </div>
        )}
      </Field>
    </div>
  )
}

function Field({
  label,
  sub,
  hint,
  children,
}: {
  label: string
  sub?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-medium">{label}</label>
        {hint && (
          <span className={cn("flex items-center gap-1 text-xs text-primary")}>
            <Sparkles className="h-3 w-3" />
            {hint}
          </span>
        )}
      </div>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      {children}
    </div>
  )
}
